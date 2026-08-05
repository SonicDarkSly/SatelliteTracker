/**
 * Moteur de propagation SGP4, indépendant de son hôte.
 *
 * Ce module ne connaît ni WebWorker ni React : il expose des fonctions pures sur
 * un état local. Il est utilisé à deux endroits :
 *   — dans le worker, cas normal, pour ne pas bloquer le rendu ;
 *   — dans le thread principal, en repli, si le worker ne démarre pas.
 *
 * Ce repli existe parce que l'inverse a coûté cher : un worker qui échouait à se
 * charger — satellite.js est un paquet ESM pur, et son chargement dans un module
 * worker peut échouer selon la configuration du bundler — laissait l'application
 * sur un voile « initialisation » perpétuel, sans le moindre message d'erreur.
 * Une dégradation visible et fonctionnelle vaut mieux qu'un blocage muet.
 */
import * as satellite from 'satellite.js';
import type { OmmRecord, SatelliteState } from '../types';

/** Points d'échantillonnage d'une orbite : détaillée pour l'objet suivi, plus grossière en lot. */
export const ORBIT_SAMPLES = 240;
export const ORBIT_BATCH_SAMPLES = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SatRec = any;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface FrameResult {
  /** Positions ECEF en mètres, 3 composantes par objet. */
  positions: Float32Array;
  /** Vitesses ECEF en m/s, 3 composantes par objet. */
  velocities: Float32Array;
  /** 1 = position exploitable, 0 = propagation en échec. */
  valid: Uint8Array;
  simEpochMs: number;
  /** Position géodésique de l'objet suivi, si demandé. */
  detail?: { index: number; state: SatelliteState };
}

export class PropagationEngine {
  private satrecs: SatRec[] = [];
  private valid = new Uint8Array(0);
  private positions = new Float32Array(0);
  private velocities = new Float32Array(0);

  /** Horloge simulée : ancrée sur l'horloge murale, avec facteur d'accélération. */
  private anchorWallMs = Date.now();
  private anchorSimMs = Date.now();
  private rate = 1;

  /** Objet dont on veut la position géodésique à chaque trame. */
  private detailIndex: number | null = null;

  get count(): number {
    return this.satrecs.length;
  }

  /**
   * Construit les enregistrements SGP4 depuis les éléments OMM.
   * Un jeu dégénéré donne `satrec.error ≠ 0` : l'objet est marqué non
   * propageable plutôt que de faire échouer l'ensemble.
   */
  init(elements: OmmRecord[]): Uint8Array {
    this.satrecs = new Array(elements.length);
    this.valid = new Uint8Array(elements.length);
    this.positions = new Float32Array(elements.length * 3);
    this.velocities = new Float32Array(elements.length * 3);

    for (let i = 0; i < elements.length; i++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rec = satellite.json2satrec(elements[i] as any) as SatRec;
        this.satrecs[i] = rec;
        this.valid[i] = rec && rec.error === 0 ? 1 : 0;
      } catch {
        this.satrecs[i] = undefined;
        this.valid[i] = 0;
      }
    }
    return this.valid.slice();
  }

  setClock(simEpochMs: number, rate: number): void {
    this.anchorWallMs = Date.now();
    this.anchorSimMs = simEpochMs;
    this.rate = rate;
  }

  setDetailIndex(index: number | null): void {
    this.detailIndex = index;
  }

  simNowMs(): number {
    return this.anchorSimMs + (Date.now() - this.anchorWallMs) * this.rate;
  }

  /** Propage tout le catalogue à l'instant simulé courant. */
  computeFrame(): FrameResult | undefined {
    if (this.satrecs.length === 0) return undefined;

    const simEpochMs = this.simNowMs();
    const when = new Date(simEpochMs);
    const gmst = satellite.gstime(when);
    const frameValid = new Uint8Array(this.satrecs.length);
    let detail: FrameResult['detail'];

    for (let i = 0; i < this.satrecs.length; i++) {
      const o = i * 3;
      if (this.valid[i] === 0) continue;

      // satellite.js renvoie `null` quand la propagation diverge (éléments trop
      // anciens, objet rentré dans l'atmosphère).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pv = satellite.propagate(this.satrecs[i], when) as any;
      const eci = pv?.position as Vec3 | false | undefined;
      const eciVel = pv?.velocity as Vec3 | false | undefined;
      if (!eci || !eciVel || !Number.isFinite(eci.x)) continue;

      const ecf = satellite.eciToEcf(eci, gmst) as Vec3;
      const ecfVel = satellite.eciToEcf(eciVel, gmst) as Vec3;

      // km → m pour Cesium (Cartesian3 en mètres).
      this.positions[o] = ecf.x * 1000;
      this.positions[o + 1] = ecf.y * 1000;
      this.positions[o + 2] = ecf.z * 1000;
      this.velocities[o] = ecfVel.x * 1000;
      this.velocities[o + 1] = ecfVel.y * 1000;
      this.velocities[o + 2] = ecfVel.z * 1000;
      frameValid[i] = 1;

      if (this.detailIndex === i) {
        const geo = satellite.eciToGeodetic(eci, gmst);
        detail = {
          index: i,
          state: {
            latitude: satellite.degreesLat(geo.latitude),
            longitude: satellite.degreesLong(geo.longitude),
            altitudeKm: geo.height,
            speedKmS: Math.hypot(eciVel.x, eciVel.y, eciVel.z),
          },
        };
      }
    }

    return {
      positions: this.positions.slice(),
      velocities: this.velocities.slice(),
      valid: frameValid,
      simEpochMs,
      detail,
    };
  }

  /**
   * Ellipse orbitale d'un objet, en repère INERTIEL (TEME).
   *
   * La rotation terrestre est appliquée au rendu, par la matrice de modèle de la
   * polyligne : convertir ici avec un temps sidéral figé décalait la trace du
   * satellite d'environ 0,5 km par seconde écoulée.
   *
   * L'échantillonnage est centré sur l'instant courant, de −½ à +½ période :
   * l'orbite ne se referme pas exactement (précession, traînée), et la
   * discontinuité résiduelle se retrouve ainsi à l'antipode du satellite plutôt
   * qu'à côté de lui.
   */
  computeOrbit(index: number, samples = ORBIT_SAMPLES): Float32Array | undefined {
    const rec = this.satrecs[index];
    if (!rec || this.valid[index] === 0) return undefined;

    const startMs = this.simNowMs();
    // rec.no est le moyen mouvement en rad/min.
    const periodMinutes = (2 * Math.PI) / rec.no;
    const out = new Float32Array((samples + 1) * 3);

    for (let s = 0; s <= samples; s++) {
      const offset = (s / samples - 0.5) * periodMinutes * 60_000;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pv = satellite.propagate(rec, new Date(startMs + offset)) as any;
      const eci = pv?.position as Vec3 | false | undefined;
      if (!eci || !Number.isFinite(eci.x)) return undefined;

      out[s * 3] = eci.x * 1000;
      out[s * 3 + 1] = eci.y * 1000;
      out[s * 3 + 2] = eci.z * 1000;
    }
    return out;
  }

  /** Lot d'orbites, échantillonnage réduit, concaténées dans un seul tampon. */
  computeOrbits(indices: number[]): { indices: number[]; samples: number; positions: Float32Array } {
    const samples = ORBIT_BATCH_SAMPLES + 1;
    const buffer = new Float32Array(indices.length * samples * 3);
    const kept: number[] = [];
    let write = 0;

    for (const index of indices) {
      const orbit = this.computeOrbit(index, ORBIT_BATCH_SAMPLES);
      if (!orbit) continue;
      buffer.set(orbit, write);
      kept.push(index);
      write += samples * 3;
    }

    return { indices: kept, samples, positions: buffer.slice(0, write) };
  }
}
