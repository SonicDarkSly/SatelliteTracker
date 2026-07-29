import type { ObjectType } from '../model/types.js';

/** Métadonnées d'un objet catalogué, absentes des TLE. */
export interface SatelliteMetadata {
  readonly noradId: string;
  /** Code propriétaire Celestrak (US, CIS, PRC, ESA, ITSO…). */
  readonly owner: string;
  readonly objectType: ObjectType;
  /** Date de lancement au format ISO (jour seul), si connue. */
  readonly launchDate?: string;
  readonly launchSite?: string;
  readonly rcsMeters2?: number;
}

export interface MetadataFetchResult {
  readonly sourceId: string;
  readonly label: string;
  /** Indexé par n° NORAD. */
  readonly byNoradId: Map<string, SatelliteMetadata>;
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * PORT — source de métadonnées de catalogue (propriétaire, nature de l'objet,
 * lancement). Séparé de `TleSourcePort` : les TLE changent plusieurs fois par
 * jour, ces métadonnées sont quasi immuables.
 */
export interface SatelliteMetadataPort {
  readonly id: string;
  readonly label: string;
  fetchMetadata(): Promise<MetadataFetchResult>;
}
