/**
 * INFRASTRUCTURE — configuration de la source Celestrak.
 *
 * Celestrak publie les éléments orbitaux du catalogue public (données issues du
 * 18ᵉ Space Defense Squadron). Politique d'usage : pas de récupération plus
 * fréquente que la mise à jour réelle des données (quelques heures) — d'où le
 * cache serveur et le TTL par défaut de 2 h.
 */

/** Un groupe de la base GP (« group » de l'API gp.php). */
export interface CelestrakGroup {
  /** Valeur du paramètre GROUP=… */
  readonly id: string;
  /** Libellé affiché dans les logs et le statut des sources. */
  readonly label: string;
}

/**
 * Groupes récupérés par défaut :
 *   active    — tout le catalogue des objets actifs (~16 000 objets)
 *   stations  — ISS, CSS et véhicules amarrés (petit fichier, étiquetage fiable)
 *
 * Volontairement limité à deux requêtes. `active` contient déjà tout le reste ;
 * chaque groupe supplémentaire ne fait qu'affiner l'étiquetage tout en
 * rapprochant de la limite de débit de Celestrak, qui répond 403 pendant une
 * heure quand elle est atteinte. Surchargeable via
 * CELESTRAK_GROUPS="active,stations,visual,last-30-days".
 */
export const DEFAULT_GROUPS: CelestrakGroup[] = [
  { id: 'active', label: 'Catalogue actif' },
  { id: 'stations', label: 'Stations spatiales' },
];

const GROUP_LABELS: Record<string, string> = {
  active: 'Catalogue actif',
  stations: 'Stations spatiales',
  visual: 'Objets visibles à l’œil nu',
  'last-30-days': 'Lancements des 30 derniers jours',
  starlink: 'Starlink',
  oneweb: 'OneWeb',
  'gps-ops': 'GPS opérationnels',
  galileo: 'Galileo',
  'glo-ops': 'GLONASS opérationnels',
  beidou: 'BeiDou',
  'iridium-NEXT': 'Iridium NEXT',
  weather: 'Météo',
  noaa: 'NOAA',
  goes: 'GOES',
  science: 'Science',
  geo: 'Géostationnaires',
  cubesat: 'CubeSats',
  'cosmos-2251-debris': 'Débris Cosmos 2251',
};

export function celestrakBaseUrl(): string {
  return process.env.CELESTRAK_BASE_URL ?? 'https://celestrak.org/NORAD/elements/gp.php';
}

/**
 * URL d'un groupe au format OMM/JSON.
 *
 * Et non plus `FORMAT=tle` : le format TLE ne réserve que cinq caractères au
 * numéro de catalogue, dont le plafond réel est 69999. Depuis juillet 2026, les
 * objets nouvellement catalogués reçoivent des numéros à six chiffres et sont
 * absents du flux TLE. L'OMM n'a pas cette limite.
 */
export function celestrakGroupUrl(groupId: string): string {
  return `${celestrakBaseUrl()}?GROUP=${encodeURIComponent(groupId)}&FORMAT=json`;
}

/** Groupes configurés (CELESTRAK_GROUPS) ou valeurs par défaut. */
export function configuredGroups(): CelestrakGroup[] {
  const raw = process.env.CELESTRAK_GROUPS?.trim();
  if (!raw) return DEFAULT_GROUPS;

  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => ({ id, label: GROUP_LABELS[id] ?? id }));
}

/** Durée de vie du cache serveur, en millisecondes (CATALOG_TTL_MINUTES, défaut 120). */
export function catalogTtlMs(): number {
  const minutes = Number(process.env.CATALOG_TTL_MINUTES ?? 120);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 120) * 60_000;
}

/**
 * Délai d'attente d'un groupe de TLE (CELESTRAK_TIMEOUT_MS, défaut 60 s).
 *
 * Le groupe « active » représente plusieurs mégaoctets : 20 s suffisaient en
 * temps normal, mais pas quand le serveur répond lentement — la requête était
 * alors abandonnée pour rien (« This operation was aborted ») alors qu'elle
 * aurait abouti.
 */
export function celestrakTimeoutMs(): number {
  const ms = Number(process.env.CELESTRAK_TIMEOUT_MS ?? 60_000);
  return Number.isFinite(ms) && ms > 1000 ? ms : 60_000;
}

/** URL du SATCAT complet (registre du catalogue, propriétaires et lancements). */
export function satcatUrl(): string {
  return process.env.CELESTRAK_SATCAT_URL ?? 'https://celestrak.org/pub/satcat.csv';
}

/**
 * Durée de vie du SATCAT en mémoire (SATCAT_TTL_HOURS, défaut 24 h).
 * Ces métadonnées ne bougent qu'au rythme des lancements.
 */
export function satcatTtlMs(): number {
  const hours = Number(process.env.SATCAT_TTL_HOURS ?? 24);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3_600_000;
}

/** Époque maximale acceptée : au-delà, le TLE est trop vieux pour être précis. */
export function maxEpochAgeDays(): number {
  const days = Number(process.env.MAX_EPOCH_AGE_DAYS ?? 30);
  return Number.isFinite(days) && days > 0 ? days : 30;
}
