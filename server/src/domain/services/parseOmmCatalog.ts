/**
 * DOMAINE — construction des enregistrements de catalogue depuis un flux OMM.
 *
 * Remplace l'analyse du format TLE. Le gain n'est pas seulement la levée de la
 * limite des numéros à cinq chiffres : les champs sont nommés, donc plus de
 * découpage par colonnes, plus de somme de contrôle à valider, plus de reprise
 * d'année sur deux chiffres. La désignation COSPAR arrive déjà formatée.
 */
import type { OmmRecord } from '../model/omm.js';
import { parseOmmRecord } from '../model/omm.js';
import type { SatelliteRecord } from '../model/types.js';
import { classifySatellite } from './classifySatellite.js';
import { orbitGeometry } from './orbitGeometry.js';

/** Le n° NORAD reste affiché en texte, complété à 5 chiffres pour les anciens objets. */
function formatNoradId(id: number): string {
  return String(id).padStart(5, '0');
}

/** Construit un enregistrement de domaine à partir d'un OMM validé. */
function toSatelliteRecord(omm: OmmRecord): SatelliteRecord {
  const { periodMinutes, altitudeKm, regime } = orbitGeometry(omm.MEAN_MOTION, omm.ECCENTRICITY);

  return {
    noradId: formatNoradId(omm.NORAD_CAT_ID),
    name: omm.OBJECT_NAME,
    intlDesignator: omm.OBJECT_ID,
    epoch: new Date(omm.EPOCH).toISOString(),
    meanMotion: omm.MEAN_MOTION,
    inclinationDeg: omm.INCLINATION,
    eccentricity: omm.ECCENTRICITY,
    periodMinutes,
    altitudeKm,
    regime,
    categories: classifySatellite(omm.OBJECT_NAME, regime),
    omm,
  };
}

/**
 * Analyse un flux OMM (tableau JSON tel que renvoyé par `FORMAT=json`).
 * Les entrées inexploitables sont écartées et comptées, comme pour les TLE
 * tronqués du format précédent.
 */
export function parseOmmCatalog(text: string): { satellites: SatelliteRecord[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { satellites: [], skipped: 0 };
  }
  if (!Array.isArray(parsed)) return { satellites: [], skipped: 0 };

  const satellites: SatelliteRecord[] = [];
  let skipped = 0;

  for (const raw of parsed) {
    const omm = parseOmmRecord(raw);
    if (!omm) {
      skipped++;
      continue;
    }
    // Une époque illisible rendrait la fraîcheur et le tri incohérents.
    if (Number.isNaN(Date.parse(omm.EPOCH))) {
      skipped++;
      continue;
    }
    satellites.push(toSatelliteRecord(omm));
  }

  return { satellites, skipped };
}
