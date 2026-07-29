import type { CatalogSnapshot } from '../model/types.js';

/** Entrée de cache : l'instantané et sa date de mise en cache. */
export interface CachedCatalog {
  readonly snapshot: CatalogSnapshot;
  readonly storedAt: number;
}

/**
 * PORT — cache du catalogue.
 * Volontairement sans persistance pour démarrer (adapter mémoire) ; un adapter
 * fichier ou Redis peut être branché sans toucher au domaine ni à l'application.
 */
export interface CatalogCachePort {
  read(): CachedCatalog | undefined;
  write(snapshot: CatalogSnapshot): void;
  clear(): void;
}
