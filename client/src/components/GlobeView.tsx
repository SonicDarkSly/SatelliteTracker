/**
 * Globe 3D (Cesium) et rendu des objets en orbite.
 *
 * Choix de rendu : une `PointPrimitiveCollection` unique plutôt que des entités
 * Cesium. Les entités sont pratiques mais coûtent trop cher à 16 000 objets
 * rafraîchis 60 fois par seconde ; la collection de points est dessinée en un
 * seul appel GPU et se contente d'une écriture de position par objet.
 *
 * Les positions viennent du worker toutes les 500 ms ; entre deux trames, on
 * extrapole linéairement avec la vitesse (p + v·Δt), ce qui donne un mouvement
 * parfaitement fluide pour une erreur de l'ordre du mètre.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  HorizontalOrigin,
  ImageryLayer,
  JulianDate,
  LabelCollection,
  LabelStyle,
  Material,
  Matrix3,
  NearFarScalar,
  OpenStreetMapImageryProvider,
  PointPrimitiveCollection,
  PolylineCollection,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Simon1994PlanetaryPositions,
  TileMapServiceImageryProvider,
  Transforms,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
  buildModuleUrl,
  defined,
  Math as CesiumMath,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { OrbitBatch, PropagationFrame } from '../hooks/usePropagation';
import type { DisplaySettings } from '../hooks/useSettings';
import type { SatelliteRecord } from '../types';
import { colorForCategories } from '../utils/format';

/** Fonds de carte proposés. */
export type BaseMapKind = 'satellite' | 'plan' | 'relief';

interface Props {
  satellites: SatelliteRecord[] | undefined;
  /** Masque de visibilité issu des filtres (1 = affiché). */
  visible: Uint8Array;
  frameRef: React.MutableRefObject<PropagationFrame | undefined>;
  /** Index du satellite sélectionné dans le catalogue, ou null. */
  selectedIndex: number | null;
  /** Ellipse orbitale du satellite sélectionné (ECEF, mètres). */
  orbit: { index: number; positions: Float32Array } | undefined;
  /** Orbites des objets affichés. */
  orbits: OrbitBatch | undefined;
  onSelect: (index: number | null) => void;
  /** Incrémenté pour demander un recentrage caméra sur la sélection. */
  focusNonce: number;
  settings: DisplaySettings;
  /**
   * Conteneur d'accueil des crédits Cesium. En le fournissant, on sort le logo
   * et les attributions du globe pour les afficher dans la barre d'état — les
   * attributions restent visibles (c'est une obligation des fournisseurs de
   * données), mais elles n'encombrent plus la vue.
   */
  creditContainer: React.RefObject<HTMLDivElement>;
  /** Instant simulé courant, pour synchroniser l'éclairage. */
  simNow: () => number;
}

/** Tolérance de sélection, en pixels : viser un point de 4 px en mouvement est illusoire. */
const PICK_TOLERANCE = 16;

/** Cadence de rafraîchissement de l'info-bulle de survol (ms). */
const HOVER_REFRESH_MS = 150;

/** Distances de référence de la mise à l'échelle des points (mètres). */
const SCALE_NEAR_M = 3.0e5;
const SCALE_FAR_M = 6.0e7;
const SCALE_FAR_FACTOR = 0.8;

/** Rayon terrestre moyen (km), repli pour l'altitude affichée au survol. */
const EARTH_RADIUS_KM = 6371;

/**
 * Distance de recul maximale de la caméra : 1,2 million de km, soit un peu plus
 * de trois fois la distance Terre–Lune (384 400 km en moyenne). Sans cela, on ne
 * peut pas reculer assez pour voir la Lune, que Cesium place pourtant à sa
 * distance et à sa taille réelles.
 */
const MAX_ZOOM_OUT_M = 1.2e9;

/** Tampons réutilisés pour la position de la Lune (évite d'allouer à chaque image). */
const moonScratch = new Cartesian3();
const moonFixedScratch = new Cartesian3();
const icrfScratch = new Matrix3();
const timeScratch = new JulianDate();
const speedScratchA = new Cartesian3();
const speedScratchB = new Cartesian3();

/**
 * Mois sidéral : durée d'une révolution complète de la Lune autour de la Terre
 * par rapport aux étoiles (27,32 jours). C'est la période à échantillonner pour
 * obtenir une trajectoire fermée — le mois synodique de 29,53 jours, lui, mesure
 * le retour des phases et ne boucle pas géométriquement.
 */
const SIDEREAL_MONTH_DAYS = 27.321661;

/** Points d'échantillonnage de la trajectoire lunaire. */
const MOON_PATH_SAMPLES = 240;

/** Intervalles de rafraîchissement de la trajectoire et de l'étiquette lunaires (ms). */
const MOON_PATH_REFRESH_MS = 5000;
const MOON_LABEL_REFRESH_MS = 500;

interface HoverInfo {
  index: number;
  /** Position de l'info-bulle, en pixels dans le conteneur. */
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  altitudeKm: number;
  speedKmS: number;
}

/**
 * Mise à l'échelle selon la distance à la caméra : un objet survolé de près doit
 * être gros et facile à viser, un objet à l'autre bout du globe doit rester un
 * point discret. Sans cela, tout reste minuscule dès qu'on zoome.
 */
function scaleByDistance(zoomBoost: number): NearFarScalar {
  return new NearFarScalar(SCALE_NEAR_M, zoomBoost, SCALE_FAR_M, SCALE_FAR_FACTOR);
}

/**
 * Position de la Lune dans le repère terrestre tournant, à un instant donné.
 *
 * Cesium calcule la position lunaire dans le repère inertiel (théorie de Simon
 * et al. 1994, la même que celle utilisée pour son propre rendu de la Lune) ;
 * il faut ensuite la faire tourner dans le repère fixe terrestre. La matrice
 * ICRF → fixe demande les données de rotation terrestre IAU2006, qui se chargent
 * en tâche de fond : tant qu'elles manquent, on se rabat sur l'approximation
 * TEME → pseudo-fixe (erreur de quelques arcsecondes, invisible à cette échelle).
 */
function moonPositionFixed(time: JulianDate): Cartesian3 | undefined {
  const inertial = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
    time,
    moonScratch,
  );
  if (!inertial) return undefined;

  const rotation =
    Transforms.computeIcrfToFixedMatrix(time, icrfScratch) ??
    Transforms.computeTemeToPseudoFixedMatrix(time, icrfScratch);
  if (!defined(rotation)) return undefined;

  return Matrix3.multiplyByVector(rotation, inertial, moonFixedScratch);
}

/**
 * Trajectoire lunaire sur un mois sidéral, dans le repère terrestre.
 *
 * Comme pour les orbites de satellites, tous les points sont tournés avec la
 * MÊME matrice (celle de l'instant de référence) : on obtient l'ellipse telle
 * qu'elle existe dans l'espace. Sans cela, la rotation de la Terre étalerait la
 * trajectoire en 27 spires.
 */
function moonPathFixed(time: JulianDate): Cartesian3[] {
  const rotation =
    Transforms.computeIcrfToFixedMatrix(time, icrfScratch) ??
    Transforms.computeTemeToPseudoFixedMatrix(time, icrfScratch);
  if (!defined(rotation)) return [];

  const out: Cartesian3[] = [];
  for (let i = 0; i <= MOON_PATH_SAMPLES; i++) {
    const seconds = (i / MOON_PATH_SAMPLES) * SIDEREAL_MONTH_DAYS * 86_400;
    const sampleTime = JulianDate.addSeconds(time, seconds, new JulianDate());
    const inertial = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
      sampleTime,
      new Cartesian3(),
    );
    if (!inertial) return out;
    out.push(Matrix3.multiplyByVector(rotation, inertial, new Cartesian3()));
  }
  return out;
}

/**
 * Vitesse orbitale de la Lune, par différence centrée sur ±60 s dans le repère
 * inertiel (≈ 1,02 km/s, variable de quelques pourcents entre périgée et apogée
 * du fait de l'excentricité de 0,055).
 */
function moonSpeedKmS(time: JulianDate): number {
  const before = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
    JulianDate.addSeconds(time, -60, timeScratch),
    speedScratchA,
  );
  const after = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
    JulianDate.addSeconds(time, 60, timeScratch),
    speedScratchB,
  );
  if (!before || !after) return 0;
  return Cartesian3.distance(before, after) / 120 / 1000;
}

/** Couche d'imagerie correspondant au fond choisi. */
function createImagery(kind: BaseMapKind): ImageryLayer {
  switch (kind) {
    case 'satellite':
      // Imagerie aérienne haute résolution, sans clé d'API.
      return new ImageryLayer(
        new UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 18,
          credit: 'Imagerie : Esri, Maxar, Earthstar Geographics',
        }),
      );
    case 'plan':
      return new ImageryLayer(
        new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
      );
    case 'relief':
    default:
      // Texture Natural Earth II livrée avec Cesium : basse résolution mais
      // disponible hors ligne et sans aucun appel réseau.
      return ImageryLayer.fromProviderAsync(
        TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII')),
        {},
      );
  }
}

export function GlobeView({
  satellites,
  visible,
  frameRef,
  selectedIndex,
  orbit,
  orbits,
  onSelect,
  focusNonce,
  settings,
  creditContainer,
  simNow,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | undefined>(undefined);
  const pointsRef = useRef<PointPrimitiveCollection | undefined>(undefined);
  const labelsRef = useRef<LabelCollection | undefined>(undefined);
  /** Orbite du satellite suivi (trait net). */
  const trackedOrbitRef = useRef<PolylineCollection | undefined>(undefined);
  /** Orbites de masse (traits fins et translucides). */
  const batchOrbitsRef = useRef<PolylineCollection | undefined>(undefined);
  /** Trajectoire lunaire. */
  const moonPathRef = useRef<PolylineCollection | undefined>(undefined);
  /** Horodatages du dernier recalcul lunaire (trajectoire et étiquette). */
  const moonTimersRef = useRef({ path: 0, label: 0 });

  // Références lues dans la boucle de rendu : évitent de recréer la scène à
  // chaque changement de filtre ou de sélection.
  const visibleRef = useRef(visible);
  const selectedRef = useRef(selectedIndex);
  const satellitesRef = useRef(satellites);
  const showLabelRef = useRef(settings.showLabel);
  const moonRef = useRef(settings.moon);
  const moonOrbitRef = useRef(settings.moonOrbit);
  visibleRef.current = visible;
  selectedRef.current = selectedIndex;
  satellitesRef.current = satellites;
  showLabelRef.current = settings.showLabel;
  moonRef.current = settings.moon;
  moonOrbitRef.current = settings.moonOrbit;

  /** Dernière position connue du curseur dans le canvas (undefined = curseur sorti). */
  const cursorRef = useRef<Cartesian2 | undefined>(undefined);
  const [hover, setHover] = useState<HoverInfo | undefined>();

  /**
   * Recalcule l'info-bulle depuis la dernière position du curseur.
   * Appelé périodiquement : le satellite se déplace sous un curseur immobile,
   * l'info-bulle doit suivre (et disparaître quand l'objet s'éloigne).
   */
  const refreshHover = useCallback(() => {
    const viewer = viewerRef.current;
    const cursor = cursorRef.current;
    const sats = satellitesRef.current;

    if (!viewer || !cursor || !sats) {
      setHover((h) => (h ? undefined : h));
      return;
    }

    const picked = viewer.scene.pick(cursor, PICK_TOLERANCE, PICK_TOLERANCE) as
      | { id?: unknown }
      | undefined;
    const index = typeof picked?.id === 'number' ? picked.id : undefined;

    viewer.scene.canvas.style.cursor = index === undefined ? '' : 'pointer';

    if (index === undefined || index >= sats.length) {
      setHover((h) => (h ? undefined : h));
      return;
    }

    const frame = frameRef.current;
    const points = pointsRef.current;
    if (!frame || !points) return;

    const position = points.get(index).position;
    const carto = Cartographic.fromCartesian(position);
    const o = index * 3;

    setHover({
      index,
      x: cursor.x,
      y: cursor.y,
      latitude: carto ? CesiumMath.toDegrees(carto.latitude) : 0,
      longitude: carto ? CesiumMath.toDegrees(carto.longitude) : 0,
      altitudeKm: carto
        ? carto.height / 1000
        : Cartesian3.magnitude(position) / 1000 - EARTH_RADIUS_KM,
      speedKmS:
        Math.hypot(frame.velocities[o], frame.velocities[o + 1], frame.velocities[o + 2]) / 1000,
    });
  }, [frameRef]);

  /* --------------------------------------------------------------- */
  /* Création du globe (une seule fois)                               */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      baseLayer: createImagery(settings.baseMap),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: false,
      // Crédits déportés dans la barre d'état (voir le commentaire du prop).
      ...(creditContainer.current ? { creditContainer: creditContainer.current } : {}),
    });

    viewer.scene.fog.enabled = false;
    // Distances de travail : de la vue rapprochée jusqu'au-delà de l'orbite lunaire.
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50_000;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = MAX_ZOOM_OUT_M;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(6.14, 46.2, 42_000_000),
    });

    const points = viewer.scene.primitives.add(new PointPrimitiveCollection());
    const batchOrbits = viewer.scene.primitives.add(new PolylineCollection());
    const moonPath = viewer.scene.primitives.add(new PolylineCollection());
    const trackedOrbit = viewer.scene.primitives.add(new PolylineCollection());
    const labels = viewer.scene.primitives.add(new LabelCollection());

    viewerRef.current = viewer;
    pointsRef.current = points;
    labelsRef.current = labels;
    trackedOrbitRef.current = trackedOrbit;
    batchOrbitsRef.current = batchOrbits;
    moonPathRef.current = moonPath;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    // Sélection au clic, avec la même tolérance que le survol.
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position, PICK_TOLERANCE, PICK_TOLERANCE) as
        | { id?: unknown }
        | undefined;
      onSelect(typeof picked?.id === 'number' ? picked.id : null);
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Survol : on mémorise la position du curseur, le pick (lecture GPU) est
    // fait à cadence fixe plutôt qu'à chaque pixel parcouru.
    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      cursorRef.current = movement.endPosition.clone();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    const onLeave = (): void => {
      cursorRef.current = undefined;
    };
    viewer.scene.canvas.addEventListener('mouseleave', onLeave);

    /* Boucle de rendu : positions extrapolées puis écrites dans la collection. */
    const onPreUpdate = (): void => {
      const frame = frameRef.current;
      const collection = pointsRef.current;
      const sats = satellitesRef.current;
      if (!frame || !collection || !sats) return;

      // Éclairage : l'heure de la scène suit l'horloge simulée.
      viewer.clock.currentTime = JulianDate.fromDate(new Date(simNow()));

      const dt = (performance.now() - frame.receivedAt) / 1000;
      const mask = visibleRef.current;
      const selected = selectedRef.current;
      const { positions, velocities, valid } = frame;
      const count = Math.min(collection.length, valid.length);

      for (let i = 0; i < count; i++) {
        const point = collection.get(i);
        const shown = valid[i] === 1 && (mask.length === 0 || mask[i] === 1);

        if (!shown && i !== selected) {
          if (point.show) point.show = false;
          continue;
        }

        const o = i * 3;
        point.position = new Cartesian3(
          positions[o] + velocities[o] * dt,
          positions[o + 1] + velocities[o + 1] * dt,
          positions[o + 2] + velocities[o + 2] * dt,
        );
        if (!point.show) point.show = true;
      }

      // Étiquette du satellite suivi, accrochée à sa position courante.
      const labelCollection = labelsRef.current;
      if (labelCollection && labelCollection.length > 0) {
        const label = labelCollection.get(0);
        const wanted =
          showLabelRef.current && selected !== null && selected < count && valid[selected] === 1;
        if (wanted && selected !== null) {
          label.position = collection.get(selected).position;
          label.text = sats[selected].name;
          label.show = true;
        } else if (label.show) {
          label.show = false;
        }
      }

      // Lune : étiquette (distance et vitesse instantanées) et trajectoire.
      const moonLabel = labelCollection && labelCollection.length > 1 ? labelCollection.get(1) : undefined;
      const moonPathCollection = moonPathRef.current;

      if (!moonRef.current) {
        if (moonLabel?.show) moonLabel.show = false;
        if (moonPathCollection && moonPathCollection.length > 0) moonPathCollection.removeAll();
      } else {
        const now = performance.now();
        const time = viewer.clock.currentTime;
        const position = moonPositionFixed(time);

        if (position && moonLabel) {
          // La position suit chaque image ; le texte n'est reformaté que deux
          // fois par seconde (formatage de chaînes en boucle de rendu = gâchis).
          moonLabel.position = position;
          moonLabel.show = true;
          if (now - moonTimersRef.current.label > MOON_LABEL_REFRESH_MS) {
            moonTimersRef.current.label = now;
            const km = Math.round(Cartesian3.magnitude(position) / 1000);
            moonLabel.text =
              `Lune — ${km.toLocaleString('fr-FR')} km · ` +
              `${moonSpeedKmS(time).toFixed(3)} km/s`;
          }
        }

        // La trajectoire est figée dans le repère inertiel au moment du calcul :
        // elle glisse lentement par rapport au repère terrestre, d'où le
        // recalcul périodique (même raison que pour les orbites de satellites).
        if (
          moonPathCollection &&
          moonOrbitRef.current &&
          now - moonTimersRef.current.path > MOON_PATH_REFRESH_MS
        ) {
          moonTimersRef.current.path = now;
          const path = moonPathFixed(time);
          moonPathCollection.removeAll();
          if (path.length > 1) {
            moonPathCollection.add({
              positions: path,
              width: 1.4,
              material: Material.fromType('Color', {
                color: Color.fromCssColorString('#d9d9d9').withAlpha(0.4),
              }),
            });
          }
        } else if (moonPathCollection && !moonOrbitRef.current && moonPathCollection.length > 0) {
          moonPathCollection.removeAll();
        }
      }
    };

    viewer.scene.preUpdate.addEventListener(onPreUpdate);

    return () => {
      viewer.scene.preUpdate.removeEventListener(onPreUpdate);
      viewer.scene.canvas.removeEventListener('mouseleave', onLeave);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = undefined;
      pointsRef.current = undefined;
      labelsRef.current = undefined;
      trackedOrbitRef.current = undefined;
      batchOrbitsRef.current = undefined;
      moonPathRef.current = undefined;
    };
    // Volontairement monté une seule fois : les mises à jour passent par les refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Rafraîchissement de l'info-bulle (le satellite bouge, pas le curseur). */
  useEffect(() => {
    if (!settings.hoverTooltip) {
      setHover(undefined);
      const viewer = viewerRef.current;
      if (viewer) viewer.scene.canvas.style.cursor = '';
      return;
    }
    const id = window.setInterval(refreshHover, HOVER_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refreshHover, settings.hoverTooltip]);

  /* --------------------------------------------------------------- */
  /* Peuplement de la collection quand le catalogue change            */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    const points = pointsRef.current;
    const labels = labelsRef.current;
    if (!points || !labels || !satellites) return;

    points.removeAll();
    labels.removeAll();

    const scale = scaleByDistance(settings.zoomBoost);
    for (let i = 0; i < satellites.length; i++) {
      points.add({
        id: i,
        position: Cartesian3.ZERO,
        color: Color.fromCssColorString(colorForCategories(satellites[i].categories)),
        pixelSize: settings.pointSize,
        scaleByDistance: scale,
        show: false,
      });
    }

    labels.add({
      position: Cartesian3.ZERO,
      text: '',
      font: '13px "Segoe UI", system-ui, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(14, -10),
      show: false,
    });

    // Étiquette de la Lune (position mise à jour dans la boucle de rendu).
    labels.add({
      position: Cartesian3.ZERO,
      text: 'Lune',
      font: '12px "Segoe UI", system-ui, sans-serif',
      fillColor: Color.fromCssColorString('#d9d9d9'),
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(16, -12),
      show: false,
    });
    // La taille est réappliquée par l'effet dédié : pas de dépendance ici, sinon
    // toute la collection serait reconstruite à chaque mouvement de curseur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellites]);

  /* --------------------------------------------------------------- */
  /* Taille des points                                                */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    const points = pointsRef.current;
    if (!points) return;

    const scale = scaleByDistance(settings.zoomBoost);
    const selected = selectedIndex;
    for (let i = 0; i < points.length; i++) {
      const point = points.get(i);
      point.pixelSize =
        i === selected ? settings.pointSize * settings.selectedScale : settings.pointSize;
      point.scaleByDistance = scale;
    }
  }, [settings.pointSize, settings.zoomBoost, satellites, selectedIndex]);

  /* --------------------------------------------------------------- */
  /* Mise en évidence de la sélection                                 */
  /* --------------------------------------------------------------- */
  const previousSelected = useRef<number | null>(null);
  useEffect(() => {
    const points = pointsRef.current;
    if (!points || !satellites) return;

    const previous = previousSelected.current;
    if (previous !== null && previous < points.length) {
      const point = points.get(previous);
      point.pixelSize = settings.pointSize;
      point.color = Color.fromCssColorString(colorForCategories(satellites[previous].categories));
      point.outlineWidth = 0;
    }

    if (selectedIndex !== null && selectedIndex < points.length) {
      const point = points.get(selectedIndex);
      point.pixelSize = settings.pointSize * settings.selectedScale;
      point.color = Color.WHITE;
      point.outlineColor = Color.fromCssColorString(
        colorForCategories(satellites[selectedIndex].categories),
      );
      point.outlineWidth = 3;
    }

    previousSelected.current = selectedIndex;
  }, [selectedIndex, satellites, settings.pointSize]);

  /* --------------------------------------------------------------- */
  /* Orbite du satellite suivi                                        */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    const polylines = trackedOrbitRef.current;
    if (!polylines) return;

    polylines.removeAll();
    if (!orbit || !satellites || orbit.index !== selectedIndex) return;

    const positions: Cartesian3[] = [];
    for (let i = 0; i + 2 < orbit.positions.length; i += 3) {
      positions.push(
        new Cartesian3(orbit.positions[i], orbit.positions[i + 1], orbit.positions[i + 2]),
      );
    }
    if (positions.length < 2) return;

    polylines.add({
      positions,
      width: 2,
      material: Material.fromType('Color', {
        color: Color.fromCssColorString(
          colorForCategories(satellites[orbit.index].categories),
        ).withAlpha(0.85),
      }),
    });
  }, [orbit, selectedIndex, satellites]);

  /* --------------------------------------------------------------- */
  /* Orbites des objets affichés                                      */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    const polylines = batchOrbitsRef.current;
    if (!polylines) return;

    polylines.removeAll();
    if (!orbits || !satellites || !settings.showOrbits) return;

    const stride = orbits.samples * 3;
    for (let k = 0; k < orbits.indices.length; k++) {
      const index = orbits.indices[k];
      const base = k * stride;
      const positions: Cartesian3[] = [];
      for (let s = 0; s < orbits.samples; s++) {
        const o = base + s * 3;
        positions.push(
          new Cartesian3(orbits.positions[o], orbits.positions[o + 1], orbits.positions[o + 2]),
        );
      }
      if (positions.length < 2) continue;

      polylines.add({
        positions,
        width: 1,
        material: Material.fromType('Color', {
          color: Color.fromCssColorString(
            colorForCategories(satellites[index].categories),
          ).withAlpha(0.28),
        }),
      });
    }
  }, [orbits, satellites, settings.showOrbits]);

  /* --------------------------------------------------------------- */
  /* Recentrage caméra sur demande                                    */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    const viewer = viewerRef.current;
    const points = pointsRef.current;
    if (!viewer || !points || focusNonce === 0 || selectedIndex === null) return;
    if (selectedIndex >= points.length) return;

    const target = points.get(selectedIndex).position;
    if (!target || Cartesian3.magnitude(target) < 1) return;

    // On recule le long du vecteur géocentrique pour cadrer l'objet et la Terre.
    const direction = Cartesian3.normalize(target, new Cartesian3());
    const destination = Cartesian3.multiplyByScalar(
      direction,
      Cartesian3.magnitude(target) + 4_000_000,
      new Cartesian3(),
    );

    viewer.camera.flyTo({
      destination,
      orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
      duration: 1.4,
    });
  }, [focusNonce, selectedIndex]);

  /* Éclairage, atmosphère et Lune */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.scene.globe.enableLighting = settings.lighting;
    viewer.scene.globe.showGroundAtmosphere = settings.atmosphere;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = settings.atmosphere;
    // Cesium dessine la Lune comme une sphère texturée à sa position et à son
    // rayon réels (1 737 km) : rien à modéliser, il suffit de l'activer.
    if (viewer.scene.moon) viewer.scene.moon.show = settings.moon;
  }, [settings.lighting, settings.atmosphere, settings.moon]);

  /* Changement de fond de carte */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.add(createImagery(settings.baseMap));
  }, [settings.baseMap]);

  const hovered = hover !== undefined && satellites ? satellites[hover.index] : undefined;

  return (
    <div className="globe-wrapper">
      <div ref={containerRef} className="globe-container" />

      {hover && hovered && (
        <div
          className="globe-tooltip"
          style={{ left: hover.x + 16, top: hover.y + 16 }}
          role="tooltip"
        >
          <div className="globe-tooltip-name">
            <span
              className="filter-dot"
              style={{ background: colorForCategories(hovered.categories) }}
            />
            {hovered.name}
          </div>
          <div className="globe-tooltip-meta">
            {hovered.ownerFlag ? `${hovered.ownerFlag} ` : ''}
            {hovered.ownerLabel ?? 'propriétaire inconnu'}
          </div>
          <div className="globe-tooltip-meta">
            {hovered.regime} · NORAD {hovered.noradId}
          </div>
          <div className="globe-tooltip-meta">
            {Math.abs(hover.latitude).toFixed(2)}° {hover.latitude >= 0 ? 'N' : 'S'} ·{' '}
            {Math.abs(hover.longitude).toFixed(2)}° {hover.longitude >= 0 ? 'E' : 'O'}
          </div>
          <div className="globe-tooltip-meta">
            {Math.round(hover.altitudeKm).toLocaleString('fr-FR')} km ·{' '}
            {hover.speedKmS.toFixed(2)} km/s
          </div>
          <div className="globe-tooltip-hint">Clic pour la fiche complète</div>
        </div>
      )}
    </div>
  );
}
