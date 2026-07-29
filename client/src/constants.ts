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

/** Clés localStorage (aucune persistance serveur : tout est local au navigateur). */
export const STORAGE_KEYS = {
  catalog: 'sattracker.catalog.v1',
  filters: 'sattracker.filters.v1',
  favorites: 'sattracker.favorites.v1',
} as const;

/** Durée de validité de la copie locale du catalogue (2 h, comme le cache serveur). */
export const LOCAL_CATALOG_TTL_MS = 2 * 60 * 60 * 1000;
