/**
 * DOMAINE — fusion de plusieurs lots de TLE en un catalogue unique.
 * Les groupes publics se recouvrent (un Starlink est aussi dans « active ») :
 * on déduplique par n° NORAD en gardant le TLE d'époque la plus récente, et on
 * cumule les catégories issues de chaque lot.
 */
import type { CategoryId, FacetCount, SatelliteRecord } from '../model/types.js';
import { CATEGORY_LABELS, REGIME_LABELS } from '../model/types.js';
import type { SatelliteFamily } from '../model/families.js';
import { FAMILIES } from '../model/families.js';

export function mergeSatellites(lots: SatelliteRecord[][]): SatelliteRecord[] {
  const byNorad = new Map<string, SatelliteRecord>();

  for (const lot of lots) {
    for (const sat of lot) {
      const existing = byNorad.get(sat.noradId);
      if (!existing) {
        byNorad.set(sat.noradId, sat);
        continue;
      }
      // TLE le plus frais, catégories cumulées, nom non générique préféré.
      const keepNew = sat.epoch > existing.epoch;
      const base = keepNew ? sat : existing;
      const categories = new Set<CategoryId>([...existing.categories, ...sat.categories]);
      categories.delete('other');
      byNorad.set(sat.noradId, {
        ...base,
        name: base.name.startsWith('NORAD ') && !sat.name.startsWith('NORAD ') ? sat.name : base.name,
        categories: categories.size > 0 ? [...categories] : ['other'],
      });
    }
  }

  return [...byNorad.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Comptages par catégorie, triés par effectif décroissant. */
export function countCategories(satellites: SatelliteRecord[]): FacetCount[] {
  const counts = new Map<string, number>();
  for (const sat of satellites) {
    for (const c of sat.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: CATEGORY_LABELS[id as CategoryId] ?? id,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Comptages par propriétaire (pays, agence, opérateur), effectif décroissant.
 * Les objets non identifiés par le SATCAT sont regroupés sous « UNK ».
 */
export function countOwners(satellites: SatelliteRecord[]): FacetCount[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const sat of satellites) {
    const code = sat.owner ?? 'UNK';
    const label = sat.ownerLabel ?? 'Propriétaire inconnu';
    const entry = counts.get(code);
    if (entry) entry.count++;
    else counts.set(code, { label, count: 1 });
  }

  return [...counts.entries()]
    .map(([id, { label, count }]) => ({ id, label, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Descriptions des seules familles présentes dans le catalogue, avec le nombre
 * d'objets rattachés. Envoyer le dictionnaire complet coûterait peu, mais le
 * limiter aux familles utilisées évite d'afficher des filtres vides.
 */
export function usedFamilies(
  satellites: SatelliteRecord[],
): Record<string, SatelliteFamily & { count: number }> {
  const counts = new Map<string, number>();
  for (const sat of satellites) {
    if (sat.family) counts.set(sat.family, (counts.get(sat.family) ?? 0) + 1);
  }

  const out: Record<string, SatelliteFamily & { count: number }> = {};
  for (const [id, count] of counts) {
    const family = FAMILIES[id];
    if (family) out[id] = { ...family, count };
  }
  return out;
}

/** Comptages par régime orbital, dans l'ordre LEO → MEO → GEO → HEO. */
export function countRegimes(satellites: SatelliteRecord[]): FacetCount[] {
  const order = ['LEO', 'MEO', 'GEO', 'HEO'] as const;
  const counts = new Map<string, number>();
  for (const sat of satellites) counts.set(sat.regime, (counts.get(sat.regime) ?? 0) + 1);
  return order
    .filter((id) => counts.has(id))
    .map((id) => ({ id, label: REGIME_LABELS[id], count: counts.get(id) ?? 0 }));
}
