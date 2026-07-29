/**
 * WORKER — propagation SGP4 de l'ensemble du catalogue.
 *
 * Le modèle SGP4 (satellite.js) transforme un TLE + un instant en position et
 * vitesse dans le repère inertiel ECI ; on convertit ensuite en ECEF (repère
 * tournant lié à la Terre), qui est le repère d'affichage de Cesium.
 *
 * Ce calcul tourne hors du thread principal : 11 000 objets deux fois par
 * seconde représentent un travail continu qui ferait tomber le rendu à
 * quelques images par seconde s'il était fait dans la boucle d'animation.
 * Entre deux trames, le thread principal extrapole avec la vitesse (erreur
 * inférieure au mètre sur 500 ms).
 */
import * as satellite from 'satellite.js';
import type { OmmRecord, WorkerRequest, WorkerResponse } from '../types';

/** Cadence d'envoi des trames au thread principal (ms). */
const FRAME_INTERVAL_MS = 500;
/** Nombre de points d'échantillonnage de l'ellipse du satellite suivi. */
const ORBIT_SAMPLES = 240;

/**
 * Échantillonnage réduit pour les orbites de masse : 60 segments suffisent à
 * l'œil sur une ellipse vue de loin, et divisent par 4 le coût d'un lot de 200
 * orbites (12 000 propagations au lieu de 48 000).
 */
const ORBIT_BATCH_SAMPLES = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SatRec = any;

interface EciVector {
  x: number;
  y: number;
  z: number;
}

let satrecs: SatRec[] = [];
let valid = new Uint8Array(0);
let positions = new Float32Array(0);
let velocities = new Float32Array(0);

/** Horloge simulée : ancrée sur l'horloge murale, avec un facteur d'accélération. */
let anchorWallMs = Date.now();
let anchorSimMs = Date.now();
let rate = 1;

/** Index de l'objet dont on veut le détail géodésique à chaque trame. */
let detailIndex: number | null = null;

let timer: ReturnType<typeof setInterval> | undefined;

const post = (message: WorkerResponse, transfer: Transferable[] = []): void => {
  (self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(
    message,
    transfer,
  );
};

function simNowMs(): number {
  return anchorSimMs + (Date.now() - anchorWallMs) * rate;
}

/**
 * Construit les enregistrements SGP4 depuis les éléments OMM.
 *
 * `json2satrec` remplace `twoline2satrec` : le format TLE ne réserve que cinq
 * caractères au numéro de catalogue et n'accueille donc plus les objets
 * catalogués depuis juillet 2026. Un jeu d'éléments dégénéré donne
 * `satrec.error ≠ 0` et l'objet est simplement marqué non propageable.
 */
function init(elements: OmmRecord[]): void {
  satrecs = new Array(elements.length);
  valid = new Uint8Array(elements.length);
  positions = new Float32Array(elements.length * 3);
  velocities = new Float32Array(elements.length * 3);

  for (let i = 0; i < elements.length; i++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec = satellite.json2satrec(elements[i] as any) as SatRec;
      satrecs[i] = rec;
      valid[i] = rec && rec.error === 0 ? 1 : 0;
    } catch {
      satrecs[i] = undefined;
      valid[i] = 0;
    }
  }

  post({ type: 'ready', count: elements.length, valid: valid.slice() });
  start();
}

/** Une trame : propagation de tout le catalogue à l'instant simulé courant. */
function computeFrame(): void {
  if (satrecs.length === 0) return;

  const simEpochMs = simNowMs();
  const when = new Date(simEpochMs);
  const gmst = satellite.gstime(when);
  const frameValid = new Uint8Array(satrecs.length);

  for (let i = 0; i < satrecs.length; i++) {
    const o = i * 3;
    if (valid[i] === 0) {
      frameValid[i] = 0;
      continue;
    }

    // satellite.js renvoie { position: false } quand la propagation diverge
    // (TLE trop ancien, objet rentré dans l'atmosphère).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pv = satellite.propagate(satrecs[i], when) as any;
    const eci = pv?.position as EciVector | false | undefined;
    const eciVel = pv?.velocity as EciVector | false | undefined;
    if (!eci || !eciVel || !Number.isFinite(eci.x)) {
      frameValid[i] = 0;
      continue;
    }

    const ecf = satellite.eciToEcf(eci, gmst) as EciVector;
    const ecfVel = satellite.eciToEcf(eciVel, gmst) as EciVector;

    // km → m pour Cesium (Cartesian3 en mètres).
    positions[o] = ecf.x * 1000;
    positions[o + 1] = ecf.y * 1000;
    positions[o + 2] = ecf.z * 1000;
    velocities[o] = ecfVel.x * 1000;
    velocities[o + 1] = ecfVel.y * 1000;
    velocities[o + 2] = ecfVel.z * 1000;
    frameValid[i] = 1;

    if (detailIndex === i) {
      const geo = satellite.eciToGeodetic(eci, gmst);
      post({
        type: 'detail',
        index: i,
        state: {
          latitude: satellite.degreesLat(geo.latitude),
          longitude: satellite.degreesLong(geo.longitude),
          altitudeKm: geo.height,
          speedKmS: Math.hypot(eciVel.x, eciVel.y, eciVel.z),
        },
      });
    }
  }

  // Copies transférées : le worker garde ses tampons de travail intacts.
  const pos = positions.slice();
  const vel = velocities.slice();
  post({ type: 'frame', simEpochMs, positions: pos, velocities: vel, valid: frameValid }, [
    pos.buffer,
    vel.buffer,
  ]);
}

/**
 * Ellipse orbitale d'un objet, échantillonnée sur une période complète.
 *
 * Les positions restent dans le repère INERTIEL (TEME), sans conversion vers le
 * repère terrestre : c'est la couche de rendu qui applique la rotation de la
 * Terre à chaque image, via la matrice de modèle de la polyligne. Convertir ici
 * avec un temps sidéral figé produisait un décalage croissant entre le satellite
 * et sa trace, puisque la Terre continuait de tourner sous une trace immobile.
 *
 * L'échantillonnage est CENTRÉ sur l'instant courant : de −½ période à +½ période.
 * L'orbite ne se referme pas exactement sur elle-même (précession et traînée la
 * déplacent en un tour), et la discontinuité résiduelle se retrouve ainsi à
 * l'antipode du satellite — donc invisible — au lieu de tomber pile à côté de
 * lui. Relier les deux extrémités par un segment, comme je l'avais d'abord fait,
 * produit un artefact bien plus voyant : une corde en travers de l'orbite.
 */
function computeOrbit(index: number, type: 'orbit' | 'previewOrbit' = 'orbit'): void {
  const rec = satrecs[index];
  if (!rec || valid[index] === 0) return;

  const startMs = simNowMs();
  // Période orbitale : rec.no est le moyen mouvement en rad/min.
  const periodMinutes = (2 * Math.PI) / rec.no;
  const out = new Float32Array((ORBIT_SAMPLES + 1) * 3);

  for (let s = 0; s <= ORBIT_SAMPLES; s++) {
    const offset = (s / ORBIT_SAMPLES - 0.5) * periodMinutes * 60_000;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pv = satellite.propagate(rec, new Date(startMs + offset)) as any;
    const eci = pv?.position as EciVector | false | undefined;
    if (!eci || !Number.isFinite(eci.x)) return;

    out[s * 3] = eci.x * 1000;
    out[s * 3 + 1] = eci.y * 1000;
    out[s * 3 + 2] = eci.z * 1000;
  }

  post({ type, index, positions: out }, [out.buffer]);
}

/**
 * Lot d'orbites pour les objets actuellement affichés.
 * Même principe que `computeOrbit` — repère inertiel, échantillonnage centré sur
 * l'instant courant — avec un pas plus grossier et un seul transfert pour le lot.
 */
function computeOrbits(indices: number[]): void {
  const samples = ORBIT_BATCH_SAMPLES + 1;
  const startMs = simNowMs();

  const kept: number[] = [];
  const buffer = new Float32Array(indices.length * samples * 3);
  let write = 0;

  for (const index of indices) {
    const rec = satrecs[index];
    if (!rec || valid[index] === 0) continue;

    const periodMinutes = (2 * Math.PI) / rec.no;
    const start = write;
    let ok = true;

    for (let s = 0; s <= ORBIT_BATCH_SAMPLES; s++) {
      const offset = (s / ORBIT_BATCH_SAMPLES - 0.5) * periodMinutes * 60_000;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pv = satellite.propagate(rec, new Date(startMs + offset)) as any;
      const eci = pv?.position as EciVector | false | undefined;
      if (!eci || !Number.isFinite(eci.x)) {
        ok = false;
        break;
      }
      buffer[start + s * 3] = eci.x * 1000;
      buffer[start + s * 3 + 1] = eci.y * 1000;
      buffer[start + s * 3 + 2] = eci.z * 1000;
    }

    if (!ok) continue; // orbite abandonnée : l'emplacement est réutilisé

    kept.push(index);
    write += samples * 3;
  }

  const positions = buffer.slice(0, write);
  post({ type: 'orbits', indices: kept, samples, positions }, [positions.buffer]);
}

function start(): void {
  if (timer !== undefined) return;
  computeFrame();
  timer = setInterval(computeFrame, FRAME_INTERVAL_MS);
}

function stop(): void {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

self.addEventListener('message', (event: MessageEvent) => {
  const request = event.data as WorkerRequest;

  switch (request.type) {
    case 'init':
      stop();
      init(request.elements);
      break;
    case 'clock':
      anchorWallMs = Date.now();
      anchorSimMs = request.simEpochMs;
      rate = request.rate;
      computeFrame();
      break;
    case 'orbit':
      computeOrbit(request.index);
      break;
    case 'previewOrbit':
      computeOrbit(request.index, 'previewOrbit');
      break;
    case 'orbits':
      computeOrbits(request.indices);
      break;
    case 'detail':
      detailIndex = request.index;
      break;
    case 'stop':
      stop();
      break;
  }
});
