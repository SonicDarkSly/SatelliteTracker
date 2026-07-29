/**
 * Filtrage du catalogue.
 * Le résultat est un masque de visibilité (Uint8Array indexé comme le catalogue)
 * plutôt qu'un tableau filtré : la couche de rendu conserve ainsi une
 * correspondance index ↔ point Cesium stable, sans reconstruire la scène.
 */
import { useMemo } from 'react';
import { DEFAULT_HIDDEN_CATEGORIES, STORAGE_KEYS } from '../constants';
import { useLocalStorage } from './useLocalStorage';
import type { SatelliteRecord } from '../types';

export interface FilterState {
  /** Catégories masquées (identifiants). */
  hiddenCategories: string[];
  /** Régimes orbitaux masqués. */
  hiddenRegimes: string[];
  /** Recherche par nom ou n° NORAD. */
  search: string;
  /** Altitude maximale affichée (km) ; 0 = pas de limite. */
  maxAltitudeKm: number;
}

const DEFAULT_FILTERS: FilterState = {
  hiddenCategories: DEFAULT_HIDDEN_CATEGORIES,
  hiddenRegimes: [],
  search: '',
  maxAltitudeKm: 0,
};

export interface FiltersResult {
  filters: FilterState;
  setFilters: (next: FilterState) => void;
  /** 1 = affiché, 0 = masqué. */
  visible: Uint8Array;
  visibleCount: number;
  /** Résultats de la recherche textuelle (au plus 50), pour la liste déroulante. */
  matches: { index: number; satellite: SatelliteRecord }[];
}

export function useSatelliteFilters(satellites: SatelliteRecord[] | undefined): FiltersResult {
  const [filters, setFilters] = useLocalStorage<FilterState>(
    STORAGE_KEYS.filters,
    DEFAULT_FILTERS,
  );

  const { visible, visibleCount } = useMemo(() => {
    if (!satellites) return { visible: new Uint8Array(0), visibleCount: 0 };

    const hiddenCat = new Set(filters.hiddenCategories);
    const hiddenReg = new Set(filters.hiddenRegimes);
    const needle = filters.search.trim().toLowerCase();
    const mask = new Uint8Array(satellites.length);
    let count = 0;

    for (let i = 0; i < satellites.length; i++) {
      const sat = satellites[i];

      // Un objet est masqué si TOUTES ses catégories sont masquées : un CubeSat
      // scientifique reste visible si « science » est actif.
      if (sat.categories.every((c) => hiddenCat.has(c))) continue;
      if (hiddenReg.has(sat.regime)) continue;
      if (filters.maxAltitudeKm > 0 && sat.altitudeKm > filters.maxAltitudeKm) continue;
      if (
        needle &&
        !sat.name.toLowerCase().includes(needle) &&
        !sat.noradId.includes(needle) &&
        !sat.intlDesignator.toLowerCase().includes(needle)
      ) {
        continue;
      }

      mask[i] = 1;
      count++;
    }

    return { visible: mask, visibleCount: count };
  }, [satellites, filters]);

  const matches = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    if (!satellites || needle.length < 2) return [];

    const out: { index: number; satellite: SatelliteRecord }[] = [];
    for (let i = 0; i < satellites.length && out.length < 50; i++) {
      const sat = satellites[i];
      if (sat.name.toLowerCase().includes(needle) || sat.noradId.includes(needle)) {
        out.push({ index: i, satellite: sat });
      }
    }
    return out;
  }, [satellites, filters.search]);

  return { filters, setFilters, visible, visibleCount, matches };
}
