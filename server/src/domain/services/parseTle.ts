/**
 * DOMAINE — décodage d'un fichier TLE (format « 3LE » : nom + 2 lignes).
 *
 * Rappel du format (colonnes fixes, indices 0-based) :
 *   Ligne 1 : [02..07] n° NORAD · [09..17] désignation internationale
 *             [18..32] époque AAJJJ.JJJJJJJJ
 *   Ligne 2 : [08..16] inclinaison · [26..33] excentricité (point décimal implicite)
 *             [52..63] moyen mouvement (rév/jour) · [63..68] n° de révolution
 */
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

/** Désignation internationale COSPAR → forme lisible (ex. « 98067A » → « 1998-067A »). */
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

/**
 * Convertit un flux TLE en enregistrements de domaine.
 * Les entrées mal formées sont ignorées silencieusement (le catalogue public
 * contient régulièrement des lignes tronquées) et comptées dans `skipped`.
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
    } else if (
      i + 2 < lines.length &&
      isTleLine(lines[i + 1], 1) &&
      isTleLine(lines[i + 2], 2)
    ) {
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

    const noradId = l1.slice(2, 7).trim();
    const meanMotion = Number(l2.slice(52, 63));
    const inclinationDeg = Number(l2.slice(8, 16));
    const eccentricity = Number(`0.${l2.slice(26, 33).trim()}`);

    if (!noradId || !Number.isFinite(meanMotion) || meanMotion <= 0) {
      skipped++;
      continue;
    }

    const displayName = name || `NORAD ${noradId}`;
    const { periodMinutes, altitudeKm, regime } = orbitGeometry(meanMotion, eccentricity);

    satellites.push({
      noradId,
      name: displayName,
      intlDesignator: formatIntlDesignator(l1.slice(9, 17)),
      line1: l1,
      line2: l2,
      epoch: parseEpoch(l1).toISOString(),
      meanMotion,
      inclinationDeg: Number.isFinite(inclinationDeg) ? inclinationDeg : 0,
      eccentricity: Number.isFinite(eccentricity) ? eccentricity : 0,
      periodMinutes,
      altitudeKm,
      regime,
      categories: classifySatellite(displayName, regime),
    });
  }

  return { satellites, skipped };
}
