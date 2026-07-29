import type { SatelliteRecord } from '../model/types.js';

/** Résultat brut d'une source de TLE (un « groupe » Celestrak, un fichier local…). */
export interface TleFetchResult {
  readonly sourceId: string;
  readonly label: string;
  readonly satellites: SatelliteRecord[];
  readonly ok: boolean;
  readonly error?: string;
  /** Instant (ms epoch) avant lequel réessayer est inutile. */
  readonly retryAt?: number;
}

/**
 * PORT — une source d'éléments orbitaux.
 * Implémenté par les adapters d'infrastructure (Celestrak, fichier de secours…).
 */
export interface TleSourcePort {
  readonly id: string;
  readonly label: string;
  fetchTles(): Promise<TleFetchResult>;
}
