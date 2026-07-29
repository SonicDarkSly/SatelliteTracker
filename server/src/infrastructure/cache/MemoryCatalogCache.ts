/**
 * INFRASTRUCTURE — cache mémoire du catalogue (pas de persistance au démarrage).
 * Le client conserve de son côté une copie en localStorage : au redémarrage du
 * serveur, la page reste utilisable immédiatement pendant le rafraîchissement.
 */
import { Injectable } from '@nestjs/common';
import type { CachedCatalog, CatalogCachePort } from '../../domain/ports/CatalogCachePort.js';
import type { CatalogSnapshot } from '../../domain/model/types.js';

@Injectable()
export class MemoryCatalogCache implements CatalogCachePort {
  private entry: CachedCatalog | undefined;

  read(): CachedCatalog | undefined {
    return this.entry;
  }

  write(snapshot: CatalogSnapshot): void {
    this.entry = { snapshot, storedAt: Date.now() };
  }

  clear(): void {
    this.entry = undefined;
  }
}
