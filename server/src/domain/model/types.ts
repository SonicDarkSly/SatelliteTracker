/** DOMAINE — modèle métier du suivi de satellites. */

/** Identifiant catalogue NORAD (5 chiffres, conservé en texte pour l'affichage). */
export type NoradId = string;

/** Régime orbital, déduit de l'altitude et de l'excentricité. */
export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';

/** Catégorie fonctionnelle (constellation, mission, usage). */
export type CategoryId =
  | 'stations'
  | 'starlink'
  | 'oneweb'
  | 'iridium'
  | 'navigation'
  | 'weather'
  | 'earth-observation'
  | 'science'
  | 'communications'
  | 'military'
  | 'cubesat'
  | 'rocket-body'
  | 'debris'
  | 'other';

/**
 * ENTITÉ — un objet en orbite avec ses éléments orbitaux (TLE à 2 lignes).
 * Le TLE est transmis tel quel au client, qui fait la propagation SGP4.
 */
export interface SatelliteRecord {
  readonly noradId: NoradId;
  readonly name: string;
  /** Désignation internationale COSPAR (ex. « 98-067A »). */
  readonly intlDesignator: string;
  readonly line1: string;
  readonly line2: string;
  /** Époque du TLE (ISO 8601) — plus elle est récente, plus la position est juste. */
  readonly epoch: string;
  /** Révolutions par jour. */
  readonly meanMotion: number;
  readonly inclinationDeg: number;
  readonly eccentricity: number;
  /** Période orbitale en minutes. */
  readonly periodMinutes: number;
  /** Altitude moyenne approximative en km (demi-grand axe − rayon terrestre). */
  readonly altitudeKm: number;
  readonly regime: OrbitRegime;
  readonly categories: CategoryId[];

  /* Champs issus du SATCAT (absents si le SATCAT n'a pas pu être récupéré). */
  /** Code propriétaire Celestrak (US, CIS, PRC, ESA, ITSO…). */
  readonly owner?: string;
  /** Libellé FR du propriétaire. */
  readonly ownerLabel?: string;
  /** Drapeau émoji si un pays unique est identifiable. */
  readonly ownerFlag?: string;
  /** Nature du propriétaire : état, agence, organisation, opérateur. */
  readonly ownerKind?: string;
  /** Nature de l'objet d'après le SATCAT. */
  readonly objectType?: ObjectType;
  /** Date de lancement (ISO, jour seul). */
  readonly launchDate?: string;
  /** Code du site de lancement (TYMSC, AFETR, KOUR…). */
  readonly launchSite?: string;
  /** Surface équivalente radar en m² (LARGE/MEDIUM/SMALL converti, ou valeur brute). */
  readonly rcsMeters2?: number;
}

/** Nature de l'objet catalogué (champ OBJECT_TYPE du SATCAT). */
export type ObjectType = 'PAY' | 'R/B' | 'DEB' | 'UNK';

/** Libellés FR des natures d'objet. */
export const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  PAY: 'Charge utile',
  'R/B': 'Étage de lanceur',
  DEB: 'Débris',
  UNK: 'Nature inconnue',
};

/** Comptage d'une facette pour l'UI de filtrage. */
export interface FacetCount {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

/** Origine et fraîcheur d'un lot de TLE. */
export interface SourceStatus {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * READ MODEL — instantané du catalogue servi au client.
 * `stale` = servi depuis un cache expiré parce que la source est injoignable.
 */
export interface CatalogSnapshot {
  readonly generatedAt: string;
  readonly fetchedAt: string;
  readonly stale: boolean;
  readonly count: number;
  readonly satellites: SatelliteRecord[];
  readonly categories: FacetCount[];
  readonly regimes: FacetCount[];
  /** Comptage par propriétaire (pays / agence / opérateur), effectif décroissant. */
  readonly owners: FacetCount[];
  readonly sources: SourceStatus[];
  readonly warnings: string[];
}

/** Libellés FR des catégories (affichés dans les filtres). */
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  stations: 'Stations spatiales',
  starlink: 'Starlink',
  oneweb: 'OneWeb',
  iridium: 'Iridium',
  navigation: 'Navigation (GPS, Galileo, GLONASS, BeiDou)',
  weather: 'Météo',
  'earth-observation': "Observation de la Terre",
  science: 'Science',
  communications: 'Télécommunications',
  military: 'Militaire / renseignement',
  cubesat: 'CubeSats & nanosatellites',
  'rocket-body': 'Étages de lanceur',
  debris: 'Débris',
  other: 'Autres',
};

/** Libellés FR des régimes orbitaux. */
export const REGIME_LABELS: Record<OrbitRegime, string> = {
  LEO: 'Orbite basse (LEO, < 2 000 km)',
  MEO: 'Orbite moyenne (MEO)',
  GEO: 'Géostationnaire (GEO, ~35 786 km)',
  HEO: 'Orbite très elliptique (HEO)',
};
