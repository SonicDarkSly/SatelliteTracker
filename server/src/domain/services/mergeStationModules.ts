/**
 * DOMAINE — regroupement des modules d'une même station spatiale.
 *
 * Le catalogue public attribue un numéro NORAD à chaque objet lancé, y compris
 * aux modules d'une station assemblée en orbite. L'ISS y figure donc cinq fois
 * (Zarya, Unity, Destiny, Zvezda, Nauka) et la station chinoise trois fois
 * (Tianhe, Wentian, Mengtian), alors qu'il s'agit chaque fois d'un seul objet
 * physique, boulonné en un seul bloc. Résultat à l'écran : plusieurs marqueurs
 * superposés et autant de résultats de recherche pour la même station.
 *
 * On ne conserve donc qu'une entrée par station, en gardant la trace des autres
 * pour pouvoir les mentionner. Le module retenu est celui de plus petit numéro
 * NORAD, c'est-à-dire le premier lancé : Zarya pour l'ISS, Tianhe pour Tiangong —
 * dans les deux cas le module de base, et la désignation employée partout.
 *
 * Le regroupement est délibérément limité aux familles de stations. L'appliquer
 * largement masquerait de vrais objets distincts : les satellites d'un même
 * lancement en constellation ont, eux aussi, des éléments orbitaux presque
 * identiques pendant plusieurs jours.
 */
import type { SatelliteRecord } from '../model/types.js';

/** Familles dont les membres sont des modules d'une seule structure. */
const STATION_FAMILIES = new Set(['iss', 'css']);

/**
 * Tolérances de confirmation. Des modules solidaires partagent nécessairement les
 * mêmes éléments ; en cas d'écart, on préfère ne rien regrouper plutôt que de
 * faire disparaître un objet réellement distinct.
 */
const MEAN_MOTION_TOLERANCE = 0.001; // rév/jour
const INCLINATION_TOLERANCE_DEG = 0.05;

export function mergeStationModules(satellites: SatelliteRecord[]): SatelliteRecord[] {
  const groups = new Map<string, SatelliteRecord[]>();
  const others: SatelliteRecord[] = [];

  for (const sat of satellites) {
    if (sat.family && STATION_FAMILIES.has(sat.family)) {
      const group = groups.get(sat.family);
      if (group) group.push(sat);
      else groups.set(sat.family, [sat]);
    } else {
      others.push(sat);
    }
  }

  const merged: SatelliteRecord[] = [];

  for (const group of groups.values()) {
    // Référence : plus petit numéro NORAD, donc premier module lancé.
    const sorted = [...group].sort((a, b) => Number(a.noradId) - Number(b.noradId));
    const reference = sorted[0];

    const sameStructure = sorted.filter(
      (sat) =>
        sat !== reference &&
        Math.abs(sat.meanMotion - reference.meanMotion) <= MEAN_MOTION_TOLERANCE &&
        Math.abs(sat.inclinationDeg - reference.inclinationDeg) <= INCLINATION_TOLERANCE_DEG,
    );
    const detached = sorted.filter((sat) => sat !== reference && !sameStructure.includes(sat));

    merged.push(
      sameStructure.length > 0
        ? {
            ...reference,
            mergedModules: sameStructure.map((sat) => ({
              noradId: sat.noradId,
              name: sat.name,
            })),
          }
        : reference,
    );
    // Un module dont les éléments diffèrent n'est pas solidaire : on le garde.
    merged.push(...detached);
  }

  return [...others, ...merged].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
