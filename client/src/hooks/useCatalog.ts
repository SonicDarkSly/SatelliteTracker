/**
 * Chargement du catalogue.
 * Stratégie : copie localStorage affichée immédiatement (démarrage instantané et
 * fonctionnement hors ligne), puis rafraîchissement réseau en arrière-plan.
 */
import { useCallback, useEffect, useState } from 'react';
import { LOCAL_CATALOG_TTL_MS, STORAGE_KEYS } from '../constants';
import { localJson } from './useLocalStorage';
import type { CatalogSnapshot } from '../types';

interface StoredCatalog {
  storedAt: number;
  snapshot: CatalogSnapshot;
}

export interface CatalogState {
  snapshot: CatalogSnapshot | undefined;
  loading: boolean;
  refreshing: boolean;
  error: string | undefined;
  /** Origine des données affichées. */
  origin: 'réseau' | 'cache local' | undefined;
  refresh: (force?: boolean) => void;
}

export function useCatalog(): CatalogState {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | undefined>();
  const [origin, setOrigin] = useState<CatalogState['origin']>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fetchCatalog = useCallback(async (force: boolean, hadLocalCopy: boolean) => {
    if (hadLocalCopy) setRefreshing(true);
    else setLoading(true);
    setError(undefined);

    try {
      const response = force
        ? await fetch('/api/satellites/refresh', { method: 'POST' })
        : await fetch('/api/satellites');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as CatalogSnapshot;
      setSnapshot(data);
      setOrigin('réseau');
      localJson.write(STORAGE_KEYS.catalog, { storedAt: Date.now(), snapshot: data });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Catalogue indisponible : ${err.message}`
          : 'Catalogue indisponible.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const stored = localJson.read<StoredCatalog>(STORAGE_KEYS.catalog);
    const usable = stored?.snapshot?.satellites?.length ? stored : undefined;

    if (usable) {
      setSnapshot(usable.snapshot);
      setOrigin('cache local');
      setLoading(false);
    }

    const expired = !usable || Date.now() - usable.storedAt > LOCAL_CATALOG_TTL_MS;
    if (expired) void fetchCatalog(false, Boolean(usable));
  }, [fetchCatalog]);

  const refresh = useCallback(
    (force = true) => void fetchCatalog(force, snapshot !== undefined),
    [fetchCatalog, snapshot],
  );

  return { snapshot, loading, refreshing, error, origin, refresh };
}
