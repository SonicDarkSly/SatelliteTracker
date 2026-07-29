/**
 * Chargement du catalogue.
 *
 * Pas de copie localStorage : le catalogue complet pèse plus de 5 Mo en JSON,
 * soit au-delà du quota localStorage de la plupart des navigateurs. L'écriture
 * échouait silencieusement, et une copie partielle écrite lors d'un démarrage
 * dégradé restait servie pendant des heures. Le serveur tourne en local et garde
 * son propre cache de 2 h : la requête réseau est de toute façon quasi immédiate.
 */
import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../constants';
import { localJson } from './useLocalStorage';
import type { CatalogSnapshot } from '../types';

export interface CatalogState {
  snapshot: CatalogSnapshot | undefined;
  loading: boolean;
  refreshing: boolean;
  error: string | undefined;
  refresh: (force?: boolean) => void;
}

export function useCatalog(): CatalogState {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetchCatalog = useCallback(async (force: boolean, hadData: boolean) => {
    if (hadData) setRefreshing(true);
    else setLoading(true);
    setError(undefined);

    try {
      const response = force
        ? await fetch('/api/satellites/refresh', { method: 'POST' })
        : await fetch('/api/satellites');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as CatalogSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(
        err instanceof Error ? `Catalogue indisponible : ${err.message}` : 'Catalogue indisponible.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Nettoyage de l'ancienne copie locale (versions antérieures du client).
    localJson.remove(STORAGE_KEYS.catalog);
    void fetchCatalog(false, false);
  }, [fetchCatalog]);

  const refresh = useCallback(
    (force = true) => void fetchCatalog(force, snapshot !== undefined),
    [fetchCatalog, snapshot],
  );

  return { snapshot, loading, refreshing, error, refresh };
}
