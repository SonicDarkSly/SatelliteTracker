/**
 * DOMAINE — géométrie orbitale déduite du TLE.
 * Le moyen mouvement (rév/jour) donne la période, donc le demi-grand axe
 * par la 3ᵉ loi de Kepler, donc l'altitude moyenne et le régime orbital.
 */
import type { OrbitRegime } from '../model/types.js';

/** Paramètre gravitationnel standard de la Terre (km³/s²). */
const MU_EARTH = 398_600.4418;
/** Rayon équatorial WGS-84 (km). */
const EARTH_RADIUS_KM = 6378.137;
/** Altitude géostationnaire nominale (km). */
const GEO_ALTITUDE_KM = 35_786;

export interface OrbitGeometry {
  /** Période orbitale en minutes. */
  readonly periodMinutes: number;
  /** Altitude moyenne (demi-grand axe − rayon terrestre), en km, arrondie. */
  readonly altitudeKm: number;
  readonly regime: OrbitRegime;
}

/**
 * @param meanMotion révolutions par jour (champ TLE)
 * @param eccentricity excentricité de l'orbite (0 = circulaire)
 */
export function orbitGeometry(meanMotion: number, eccentricity: number): OrbitGeometry {
  const periodMinutes = 1440 / meanMotion;
  // n en rad/s → a = (µ / n²)^(1/3)
  const nRadPerSec = (meanMotion * 2 * Math.PI) / 86_400;
  const semiMajorAxisKm = Math.cbrt(MU_EARTH / (nRadPerSec * nRadPerSec));
  const altitudeKm = semiMajorAxisKm - EARTH_RADIUS_KM;

  return {
    periodMinutes: Math.round(periodMinutes * 10) / 10,
    altitudeKm: Math.round(altitudeKm),
    regime: classifyRegime(altitudeKm, eccentricity, periodMinutes),
  };
}

/**
 * Classification usuelle :
 *   HEO  orbite très elliptique (e > 0,25) — Molnia, transferts, sondes
 *   GEO  période sidérale ~1 436 min et orbite quasi circulaire
 *   LEO  altitude < 2 000 km
 *   MEO  entre les deux
 */
function classifyRegime(
  altitudeKm: number,
  eccentricity: number,
  periodMinutes: number,
): OrbitRegime {
  if (eccentricity > 0.25) return 'HEO';
  if (Math.abs(periodMinutes - 1436) < 30 && Math.abs(altitudeKm - GEO_ALTITUDE_KM) < 1500) {
    return 'GEO';
  }
  if (altitudeKm < 2000) return 'LEO';
  return 'MEO';
}
