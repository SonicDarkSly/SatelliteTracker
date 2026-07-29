/**
 * Globe 3D (Cesium) et rendu des objets en orbite.
 *
 * Choix de rendu : une `PointPrimitiveCollection` unique plutôt que des entités
 * Cesium. Les entités sont pratiques mais coûtent trop cher à 11 000 objets
 * rafraîchis 60 fois par seconde ; la collection de points est dessinée en un
 * seul appel GPU et se contente d'une écriture de position par objet.
 *
 * Les positions viennent du worker toutes les 500 ms ; entre deux trames, on
 * extrapole linéairement avec la vitesse (p + v·Δt), ce qui donne un mouvement
 * parfaitement fluide pour une erreur de l'ordre du mètre.
 *
 * Aucune clé Cesium ion n'est nécessaire : la texture Natural Earth II livrée
 * avec Cesium est utilisée comme fond de carte, tout fonctionne hors ligne.
 */
import { useEffect, useRef } from 'react';
import {
  Cartesian2,
  Cartesian3,
  Color,
  HorizontalOrigin,
  ImageryLayer,
  JulianDate,
  LabelCollection,
  LabelStyle,
  Material,
  PointPrimitiveCollection,
  PolylineCollection,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  VerticalOrigin,
  Viewer,
  buildModuleUrl,
  Math as CesiumMath,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { PropagationFrame } from '../hooks/usePropagation';
import type { SatelliteRecord } from '../types';
import { colorForCategories } from '../utils/format';

interface Props {
  satellites: SatelliteRecord[] | undefined;
  /** Masque de visibilité issu des filtres (1 = affiché). */
  visible: Uint8Array;
  frameRef: React.MutableRefObject<PropagationFrame | undefined>;
  /** Index du satellite sélectionné dans le catalogue, ou null. */
  selectedIndex: number | null;
  /** Ellipse orbitale du satellite sélectionné (ECEF, mètres). */
  orbit: { index: number; positions: Float32Array } | undefined;
  onSelect: (index: number | null) => void;
  /** Incrémenté pour demander un recentrage caméra sur la sélection. */
  focusNonce: number;
  /** Éclairage réaliste (terminateur jour/nuit). */
  lighting: boolean;
  /** Instant simulé courant, pour synchroniser l'éclairage. */
  simNow: () => number;
}

/** Taille en pixels des points selon l'importance de l'objet. */
const POINT_SIZE = 3.2;
const SELECTED_POINT_SIZE = 11;

export function GlobeView({
  satellites,
  visible,
  frameRef,
  selectedIndex,
  orbit,
  onSelect,
  focusNonce,
  lighting,
  simNow,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | undefined>(undefined);
  const pointsRef = useRef<PointPrimitiveCollection | undefined>(undefined);
  const labelsRef = useRef<LabelCollection | undefined>(undefined);
  const polylinesRef = useRef<PolylineCollection | undefined>(undefined);

  // Références lues dans la boucle de rendu : évitent de recréer la scène à
  // chaque changement de filtre ou de sélection.
  const visibleRef = useRef(visible);
  const selectedRef = useRef(selectedIndex);
  const satellitesRef = useRef(satellites);
  const lightingRef = useRef(lighting);
  visibleRef.current = visible;
  selectedRef.current = selectedIndex;
  satellitesRef.current = satellites;
  lightingRef.current = lighting;

  /* --------------------------------------------------------------- */
  /* Création du globe (une seule fois)                               */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      // Fond de carte local livré avec Cesium : aucun compte ni jeton requis.
      baseLayer: ImageryLayer.fromProviderAsync(
        TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII')),
        {},
      ),
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
    });

    viewer.scene.globe.enableLighting = lighting;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.fog.enabled = false;
    // Distances de travail : de l'orbite basse à bien au-delà du géostationnaire.
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 500_000;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 200_000_000;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(6.14, 46.2, 42_000_000),
    });

    const points = viewer.scene.primitives.add(new PointPrimitiveCollection());
    const labels = viewer.scene.primitives.add(new LabelCollection());
    const polylines = viewer.scene.primitives.add(new PolylineCollection());

    viewerRef.current = viewer;
    pointsRef.current = points;
    labelsRef.current = labels;
    polylinesRef.current = polylines;

    // Sélection au clic : l'identifiant du point est son index catalogue.
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position) as { id?: unknown } | undefined;
      onSelect(typeof picked?.id === 'number' ? picked.id : null);
    }, ScreenSpaceEventType.LEFT_CLICK);

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
        if (selected !== null && selected < count && valid[selected] === 1) {
          label.position = collection.get(selected).position;
          label.text = sats[selected].name;
          label.show = true;
        } else {
          label.show = false;
        }
      }
    };

    viewer.scene.preUpdate.addEventListener(onPreUpdate);

    return () => {
      viewer.scene.preUpdate.removeEventListener(onPreUpdate);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = undefined;
      pointsRef.current = undefined;
      labelsRef.current = undefined;
      polylinesRef.current = undefined;
    };
    // Volontairement monté une seule fois : les mises à jour passent par les refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------------- */
  /* Peuplement de la collection quand le catalogue change            */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    const points = pointsRef.current;
    const labels = labelsRef.current;
    if (!points || !labels || !satellites) return;

    points.removeAll();
    labels.removeAll();

    for (let i = 0; i < satellites.length; i++) {
      points.add({
        id: i,
        position: Cartesian3.ZERO,
        color: Color.fromCssColorString(colorForCategories(satellites[i].categories)),
        pixelSize: POINT_SIZE,
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
      pixelOffset: new Cartesian2(12, -8),
      show: false,
    });
  }, [satellites]);

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
      point.pixelSize = POINT_SIZE;
      point.color = Color.fromCssColorString(colorForCategories(satellites[previous].categories));
      point.outlineWidth = 0;
    }

    if (selectedIndex !== null && selectedIndex < points.length) {
      const point = points.get(selectedIndex);
      point.pixelSize = SELECTED_POINT_SIZE;
      point.color = Color.WHITE;
      point.outlineColor = Color.fromCssColorString(
        colorForCategories(satellites[selectedIndex].categories),
      );
      point.outlineWidth = 3;
    }

    previousSelected.current = selectedIndex;
  }, [selectedIndex, satellites]);

  /* --------------------------------------------------------------- */
  /* Tracé de l'ellipse orbitale                                      */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    const polylines = polylinesRef.current;
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
      width: 1.6,
      material: Material.fromType('Color', {
        color: Color.fromCssColorString(
          colorForCategories(satellites[orbit.index].categories),
        ).withAlpha(0.75),
      }),
    });
  }, [orbit, selectedIndex, satellites]);

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

  /* Éclairage jour/nuit */
  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer) viewer.scene.globe.enableLighting = lighting;
  }, [lighting]);

  return <div ref={containerRef} className="globe-container" />;
}
