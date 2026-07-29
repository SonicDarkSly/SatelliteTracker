/**
 * DOMAINE — décodage d'un fichier TLE (format « 3LE » : nom + 2 lignes).
 *
 * Le format TLE n'est plus la source principale — Celestrak le remplace par l'OMM
 * depuis que les numéros de catalogue dépassent cinq chiffres — mais il reste
 * omniprésent : c'est ce qu'on trouve dans les fichiers, les archives et les
 * autres fournisseurs. Les TLE lus ici sont donc **convertis en OMM** dès
 * l'ingestion, de sorte que le reste du système ne connaisse qu'un seul format.
 *
 * Rappel du format (colonnes fixes, indices 0-based) :
 *   Ligne 1 : [02..07] n° NORAD · [09..17] désignation internationale
 *             [18..32] époque AAJJJ.JJJJJJJJ · [33..43] dn/dt
 *             [44..52] d²n/dt² · [53..61] B* · [64..68] n° du jeu d'éléments
 *   Ligne 2 : [08..16] inclinaison · [17..25] ascension droite du nœud
 *             [26..33] excentricité (point décimal implicite)
 *             [34..42] argument du périgée · [43..51] anomalie moyenne
 *             [52..63] moyen mouvement (rév/jour) · [63..68] n° de révolution
 */
import type { OmmRecord } from '../model/omm.js';
import type { SatelliteRecord } from '../model/types.js';
import { classifySatellite } from './classifySatellite.js';
import { orbitGeometry } from './orbitGeometry.js';

/** Rayon équatorial terrestre WGS-84 (km). */
export const EARTH_RADIUS_KM = 6378.137;

/** Somme de contrôle TLE : somme des chiffres, les « - » comptant pour 1, modulo 10. */
function checksum(line: string): number {
  let sum = 0;
  for (let i = 0; i < 68 && i < line.length; i++) {
    const c = line[i];
    if (c >= '0' && c <= '9') sum += c.charCodeAt(0) - 48;
    else if (c === '-') sum += 1;
  }
  return sum % 10;
}

/** Vrai si la ligne porte une somme de contrôle cohérente (TLE non corrompu). */
export function hasValidChecksum(line: string): boolean {
  if (line.length < 69) return false;
  const declared = Number(line[68]);
  return Number.isInteger(declared) && declared === checksum(line);
}

/** Époque TLE (AAJJJ.JJJJ) → Date UTC. Années 57-99 → 19xx, 00-56 → 20xx. */
export function parseEpoch(line1: string): Date {
  const raw = line1.slice(18, 32).trim();
  const yy = Number(raw.slice(0, 2));
  const dayOfYear = Number(raw.slice(2));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const startOfYear = Date.UTC(year, 0, 1);
  return new Date(startOfYear + (dayOfYear - 1) * 86_400_000);
}

/**
 * Champ TLE à point décimal et exposant implicites, par ex. « 30074-3 » qui
 * signifie 0,30074 × 10⁻³. Économie de caractères héritée des cartes perforées,
 * et l'une des raisons pour lesquelles l'OMM lui succède.
 */
function parseImpliedExponent(field: string): number {
  const raw = field.trim();
  if (!raw || /^[+-]?0+$/.test(raw)) return 0;

  const match = /^([+-]?)(\d+)([+-]\d)$/.exec(raw);
  if (!match) {
    const plain = Number(raw);
    return Number.isFinite(plain) ? plain : 0;
  }
  const [, sign, digits, exponent] = match;
  const value = Number(`0.${digits}`) * Math.pow(10, Number(exponent));
  return sign === '-' ? -value : value;
}

/** Désignation internationale COSPAR → forme lisible (« 98067A » → « 1998-067A »). */
function formatIntlDesignator(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length < 5) return trimmed;
  const yy = Number(trimmed.slice(0, 2));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return `${year}-${trimmed.slice(2)}`;
}

/** Une paire de lignes TLE valide (contrôles de forme uniquement). */
function isTleLine(line: string, index: 1 | 2): boolean {
  return line.length >= 69 && line.startsWith(`${index} `);
}

/** Construit l'OMM équivalent à un couple de lignes TLE. */
function toOmm(name: string, l1: string, l2: string): OmmRecord | undefined {
  const noradId = Number(l1.slice(2, 7).trim());
  const meanMotion = Number(l2.slice(52, 63));
  if (!Number.isFinite(noradId) || !Number.isFinite(meanMotion) || meanMotion <= 0) {
    return undefined;
  }

  return {
    OBJECT_NAME: name,
    OBJECT_ID: formatIntlDesignator(l1.slice(9, 17)),
    EPOCH: parseEpoch(l1).toISOString(),
    MEAN_MOTION: meanMotion,
    ECCENTRICITY: Number(`0.${l2.slice(26, 33).trim()}`),
    INCLINATION: Number(l2.slice(8, 16)),
    RA_OF_ASC_NODE: Number(l2.slice(17, 25)),
    ARG_OF_PERICENTER: Number(l2.slice(34, 42)),
    MEAN_ANOMALY: Number(l2.slice(43, 51)),
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: l1[7] ?? 'U',
    NORAD_CAT_ID: noradId,
    ELEMENT_SET_NO: Number(l1.slice(64, 68).trim()) || 999,
    REV_AT_EPOCH: Number(l2.slice(63, 68).trim()) || 0,
    BSTAR: parseImpliedExponent(l1.slice(53, 61)),
    MEAN_MOTION_DOT: Number(l1.slice(33, 43)) || 0,
    MEAN_MOTION_DDOT: parseImpliedExponent(l1.slice(44, 52)),
  };
}

/**
 * Convertit un flux TLE en enregistrements de domaine.
 * Les entrées mal formées sont ignorées silencieusement (les fichiers publics
 * contiennent régulièrement des lignes tronquées) et comptées dans `skipped`.
 */
export function parseTleCatalog(text: string): { satellites: SatelliteRecord[]; skipped: number } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.length > 0);

  const satellites: SatelliteRecord[] = [];
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    // On cherche un triplet « nom / 1 … / 2 … ». Certains flux omettent le nom.
    let name = '';
    let l1: string;
    let l2: string;

    if (isTleLine(lines[i], 1) && i + 1 < lines.length && isTleLine(lines[i + 1], 2)) {
      l1 = lines[i];
      l2 = lines[i + 1];
      i += 1;
    } else if (i + 2 < lines.length && isTleLine(lines[i + 1], 1) && isTleLine(lines[i + 2], 2)) {
      name = lines[i].replace(/^0 /, '').trim();
      l1 = lines[i + 1];
      l2 = lines[i + 2];
      i += 2;
    } else {
      skipped++;
      continue;
    }

    if (!hasValidChecksum(l1) || !hasValidChecksum(l2)) {
      skipped++;
      continue;
    }

    const displayName = name || `NORAD ${l1.slice(2, 7).trim()}`;
    const omm = toOmm(displayName, l1, l2);
    if (!omm) {
      skipped++;
      continue;
    }

    const { periodMinutes, altitudeKm, regime } = orbitGeometry(
      omm.MEAN_MOTION,
      omm.ECCENTRICITY,
    );

    satellites.push({
      noradId: String(omm.NORAD_CAT_ID).padStart(5, '0'),
      name: displayName,
      intlDesignator: omm.OBJECT_ID,
      omm,
      epoch: omm.EPOCH,
      meanMotion: omm.MEAN_MOTION,
      inclinationDeg: Number.isFinite(omm.INCLINATION) ? omm.INCLINATION : 0,
      eccentricity: Number.isFinite(omm.ECCENTRICITY) ? omm.ECCENTRICITY : 0,
      periodMinutes,
      altitudeKm,
      regime,
      categories: classifySatellite(displayName, regime),
    });
  }

  return { satellites, skipped };
}
