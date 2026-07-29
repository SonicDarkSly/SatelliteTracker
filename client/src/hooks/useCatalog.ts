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

/**
 * Requête en cours, partagée par tous les montages du hook.
 *
 * StrictMode monte deux fois les effets en développement, et le rechargement à
 * chaud de Vite remonte l'application à chaque édition : sans cette
 * mutualisation, chaque montage retélécharge plusieurs mégaoctets et relance un
 * cycle de sources côté serveur.
 */
let pending: Promise<CatalogSnapshot> | undefined;

function loadCatalog(force: boolean): Promise<CatalogSnapshot> {
  if (!force && pending) return pending;

  const request = (
    force
      ? fetch('/api/satellites/refresh', { method: 'POST' })
      : fetch('/api/satellites')
  )
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<CatalogSnapshot>;
    })
    .finally(() => {
      if (pending === request) pending = undefined;
    });

  pending = request;
  return request;
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
      setSnapshot(await loadCatalog(force));
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
