/**
 * DOMAINE — rattachement d'un objet à une famille décrite.
 *
 * Ordre de priorité, et il compte :
 *   1. nature de l'objet (registre SATCAT ou suffixe du nom) — un débris ou un
 *      étage de lanceur n'est pas la mission dont il porte le nom. Sans cette
 *      règle en premier, « FENGYUN 1C DEB » serait présenté comme un satellite
 *      météorologique chinois alors que c'est un fragment issu de sa destruction ;
 *   2. règles nominatives (constellation, programme, série), qui donnent la
 *      description la plus précise ;
 *   3. replis par catégorie puis par régime orbital, moins précis mais informatifs
 *      — un objet géostationnaire inconnu est presque à coup sûr un relais télécom.
 */
import { FAMILY_RULES } from '../model/families.js';
import type { CategoryId, ObjectType, OrbitRegime } from '../model/types.js';

export function identifyFamily(
  name: string,
  categories: CategoryId[],
  regime: OrbitRegime,
  objectType: ObjectType | undefined,
): string {
  // 1. Nature de l'objet — registre d'abord, suffixe du nom ensuite.
  if (objectType === 'R/B' || categories.includes('rocket-body')) return 'rocket_body';
  if (objectType === 'DEB' || categories.includes('debris')) return 'debris';

  // 2. Règles nominatives, de la plus spécifique à la plus générale.
  for (const rule of FAMILY_RULES) {
    if (rule.pattern.test(name)) return rule.family;
  }

  // 3. Replis.
  if (categories.includes('cubesat')) return 'cubesat';
  if (categories.includes('military')) return 'military';
  if (categories.includes('navigation')) return 'gps';
  if (categories.includes('earth-observation')) return 'optical_commercial';
  if (regime === 'GEO') return 'geo_telecom';

  return 'unidentified';
}
