/**
 * DOMAINE — éléments orbitaux au format OMM (Orbit Mean-Elements Message).
 *
 * L'OMM est le standard CCSDS qui remplace le TLE. Celestrak le publie depuis
 * 2020 et l'a rendu indispensable en juillet 2026 : le TLE, héritier des cartes
 * perforées, ne réserve que **cinq caractères** au numéro de catalogue. Le
 * plafond réel étant 69999 et non 99999, les objets nouvellement catalogués
 * reçoivent des numéros à six chiffres qui ne peuvent pas y tenir — ils
 * disparaissent purement et simplement du flux TLE.
 *
 * L'OMM lève aussi deux autres limites du TLE : les époques y sont en ISO 8601
 * complet (le TLE codait l'année sur deux chiffres) et les champs sont nommés
 * plutôt que positionnels, donc ni colonnes fixes ni somme de contrôle à valider.
 *
 * On conserve exactement les champs nécessaires à la propagation SGP4 : c'est ce
 * bloc que le client transmet tel quel à `json2satrec`.
 */

/** Éléments orbitaux moyens d'un objet, tels que publiés par Celestrak. */
export interface OmmRecord {
  readonly OBJECT_NAME: string;
  /** Désignation internationale COSPAR, déjà formatée (ex. « 1998-067A »). */
  readonly OBJECT_ID: string;
  /** Époque des éléments, ISO 8601. */
  readonly EPOCH: string;
  /** Révolutions par jour. */
  readonly MEAN_MOTION: number;
  readonly ECCENTRICITY: number;
  /** Degrés. */
  readonly INCLINATION: number;
  readonly RA_OF_ASC_NODE: number;
  readonly ARG_OF_PERICENTER: number;
  readonly MEAN_ANOMALY: number;
  readonly EPHEMERIS_TYPE: number;
  readonly CLASSIFICATION_TYPE: string;
  /** Numéro de catalogue, sans limite de longueur contrairement au TLE. */
  readonly NORAD_CAT_ID: number;
  readonly ELEMENT_SET_NO: number;
  readonly REV_AT_EPOCH: number;
  /** Coefficient de traînée. */
  readonly BSTAR: number;
  readonly MEAN_MOTION_DOT: number;
  readonly MEAN_MOTION_DDOT: number;
}

/** Champs indispensables à la propagation : leur absence rend l'objet inutilisable. */
const REQUIRED_NUMERIC: (keyof OmmRecord)[] = [
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'NORAD_CAT_ID',
  'BSTAR',
];

/**
 * Valide et normalise un enregistrement OMM issu du réseau.
 *
 * Celestrak sérialise certains champs numériques en chaîne selon le format
 * demandé ; on convertit donc systématiquement, et on rejette l'objet si un
 * champ nécessaire au calcul manque ou n'est pas un nombre fini.
 */
export function parseOmmRecord(raw: unknown): OmmRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const source = raw as Record<string, unknown>;

  const name = typeof source.OBJECT_NAME === 'string' ? source.OBJECT_NAME.trim() : '';
  const epoch = typeof source.EPOCH === 'string' ? source.EPOCH : '';
  if (!epoch) return undefined;

  const num = (key: string): number => Number(source[key]);
  const record: OmmRecord = {
    OBJECT_NAME: name || `NORAD ${String(source.NORAD_CAT_ID ?? '?')}`,
    OBJECT_ID: typeof source.OBJECT_ID === 'string' ? source.OBJECT_ID.trim() : '',
    EPOCH: epoch,
    MEAN_MOTION: num('MEAN_MOTION'),
    ECCENTRICITY: num('ECCENTRICITY'),
    INCLINATION: num('INCLINATION'),
    RA_OF_ASC_NODE: num('RA_OF_ASC_NODE'),
    ARG_OF_PERICENTER: num('ARG_OF_PERICENTER'),
    MEAN_ANOMALY: num('MEAN_ANOMALY'),
    EPHEMERIS_TYPE: Number.isFinite(num('EPHEMERIS_TYPE')) ? num('EPHEMERIS_TYPE') : 0,
    CLASSIFICATION_TYPE:
      typeof source.CLASSIFICATION_TYPE === 'string' ? source.CLASSIFICATION_TYPE : 'U',
    NORAD_CAT_ID: num('NORAD_CAT_ID'),
    ELEMENT_SET_NO: Number.isFinite(num('ELEMENT_SET_NO')) ? num('ELEMENT_SET_NO') : 999,
    REV_AT_EPOCH: Number.isFinite(num('REV_AT_EPOCH')) ? num('REV_AT_EPOCH') : 0,
    BSTAR: num('BSTAR'),
    MEAN_MOTION_DOT: Number.isFinite(num('MEAN_MOTION_DOT')) ? num('MEAN_MOTION_DOT') : 0,
    MEAN_MOTION_DDOT: Number.isFinite(num('MEAN_MOTION_DDOT')) ? num('MEAN_MOTION_DDOT') : 0,
  };

  for (const key of REQUIRED_NUMERIC) {
    if (!Number.isFinite(record[key] as number)) return undefined;
  }
  if (record.MEAN_MOTION <= 0) return undefined;

  return record;
}
