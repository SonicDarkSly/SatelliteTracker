/** Types partagés avec l'API (miroir du read model du serveur). */

export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';

export interface SatelliteRecord {
  noradId: string;
  name: string;
  intlDesignator: string;
  line1: string;
  line2: string;
  epoch: string;
  meanMotion: number;
  inclinationDeg: number;
  eccentricity: number;
  periodMinutes: number;
  altitudeKm: number;
  regime: OrbitRegime;
  categories: string[];
}

export interface FacetCount {
  id: string;
  label: string;
  count: number;
}

export interface SourceStatus {
  id: string;
  label: string;
  count: number;
  ok: boolean;
  error?: string;
}

export interface CatalogSnapshot {
  generatedAt: string;
  fetchedAt: string;
  stale: boolean;
  count: number;
  satellites: SatelliteRecord[];
  categories: FacetCount[];
  regimes: FacetCount[];
  sources: SourceStatus[];
  warnings: string[];
}

/** Position instantanée d'un objet, calculée par le worker. */
export interface SatelliteState {
  /** Latitude géodésique en degrés. */
  latitude: number;
  /** Longitude en degrés. */
  longitude: number;
  /** Altitude au-dessus de l'ellipsoïde, en km. */
  altitudeKm: number;
  /** Norme de la vitesse en km/s. */
  speedKmS: number;
}

/* ------------------------------------------------------------------ */
/* Protocole d'échange avec le worker de propagation                   */
/* ------------------------------------------------------------------ */

export type WorkerRequest =
  | { type: 'init'; tles: { line1: string; line2: string }[] }
  | { type: 'clock'; simEpochMs: number; rate: number }
  | { type: 'orbit'; index: number }
  | { type: 'detail'; index: number | null }
  | { type: 'stop' };

export type WorkerResponse =
  | { type: 'ready'; count: number; valid: Uint8Array }
  | {
      type: 'frame';
      simEpochMs: number;
      /** Positions ECEF en mètres, 3 composantes par objet. */
      positions: Float32Array;
      /** Vitesses ECEF en m/s, 3 composantes par objet (extrapolation entre deux trames). */
      velocities: Float32Array;
      /** 1 = position valide, 0 = propagation en échec (TLE dégénéré). */
      valid: Uint8Array;
    }
  | {
      type: 'orbit';
      index: number;
      /** Ellipse orbitale fermée, ECEF en mètres, figée à l'instant de calcul. */
      positions: Float32Array;
    }
  | { type: 'detail'; index: number; state: SatelliteState };
