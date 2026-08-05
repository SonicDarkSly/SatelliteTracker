/** Constantes d'affichage et de configuration du client. */

/** Couleur d'affichage par catégorie (teintes distinctes sur fond sombre). */
export const CATEGORY_COLORS: Record<string, string> = {
  stations: '#ff4d4f',
  starlink: '#40a9ff',
  oneweb: '#9254de',
  iridium: '#36cfc9',
  navigation: '#ffc53d',
  weather: '#73d13d',
  'earth-observation': '#95de64',
  science: '#f759ab',
  communications: '#597ef7',
  military: '#ff9c6e',
  cubesat: '#5cdbd3',
  'rocket-body': '#8c8c8c',
  debris: '#595959',
  other: '#bfbfbf',
};

/** Ordre de priorité : la couleur du premier tag correspondant est utilisée. */
export const CATEGORY_PRIORITY: string[] = [
  'stations',
  'navigation',
  'weather',
  'science',
  'earth-observation',
  'starlink',
  'oneweb',
  'iridium',
  'communications',
  'military',
  'cubesat',
  'rocket-body',
  'debris',
  'other',
];

/** Catégories masquées au premier chargement (l'essentiel du catalogue). */
export const DEFAULT_HIDDEN_CATEGORIES: string[] = ['debris', 'rocket-body'];

/** Facteurs d'accélération du temps proposés dans la barre de contrôle. */
export const TIME_RATES = [
  { value: 1, label: 'Temps réel' },
  { value: 10, label: '× 10' },
  { value: 60, label: '× 60' },
  { value: 600, label: '× 600' },
  { value: 3600, label: '× 3 600' },
] as const;

/**
 * Fonds de carte. « Relief » est la texture livrée avec Cesium : basse
 * résolution (floue en zoom rapproché) mais utilisable hors ligne. Les deux
 * autres sont des services tuilés publics, sans clé d'API.
 */
export const BASE_MAPS = [
  { value: 'satellite', label: 'Satellite' },
  { value: 'plan', label: 'Plan' },
  { value: 'relief', label: 'Relief (hors ligne)' },
] as const;

/** Clés localStorage (aucune persistance serveur : tout est local au navigateur). */
export const STORAGE_KEYS = {
  /** Conservée pour purger l'ancienne copie du catalogue (voir useCatalog). */
  catalog: 'sattracker.catalog.v1',
  filters: 'sattracker.filters.v1',
  favorites: 'sattracker.favorites.v1',
  legend: 'sattracker.legend.v1',
  // v2 : les réglages de taille ont changé de signification (valeurs
  // indépendantes, exprimées en pixels en vue globe). Conserver les anciennes
  // aurait donné des marqueurs démesurés.
  settings: 'sattracker.settings.v2',
} as const;

/**
 * Plafond d'orbites tracées simultanément. Une orbite = 120 segments ; au-delà
 * de quelques centaines, le globe devient illisible bien avant d'être lent.
 */
export const ORBIT_BATCH_MAX = 200;

/**
 * Seuil en dessous duquel on considère le catalogue dégradé et on alerte
 * l'utilisateur. Le catalogue complet dépasse 15 000 objets ; quelques centaines
 * signifient qu'une source majeure manque. Même valeur que le garde-fou serveur.
 */
export const MIN_USABLE_CATALOG = 1000;

/**
 * Délai de garde avant de considérer que le moteur de propagation n'a pas
 * démarré. Choisi large : construire 16 000 enregistrements SGP4 prend moins de
 * 100 ms, mais le transfert du catalogue vers le worker peut être lent sur une
 * machine chargée. Au-delà, il s'agit d'une anomalie, pas d'une lenteur.
 */
export const INIT_TIMEOUT_MS = 15_000;
