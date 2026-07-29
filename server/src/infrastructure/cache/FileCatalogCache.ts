/**
 * INFRASTRUCTURE — cache du catalogue sur disque (`server/data/catalog.json`).
 *
 * Remplace l'adapter mémoire : le catalogue survit aux redémarrages, ce qui évite
 * de retélécharger 5 fichiers chez Celestrak à chaque relance et donc de se faire
 * bloquer (HTTP 403). Le port `CatalogCachePort` est inchangé — c'est
 * exactement le genre de substitution que l'architecture hexagonale permet.
 */
import { Injectable, Logger } from '@nestjs/common';
import { join } from 'node:path';
import type { CachedCatalog, CatalogCachePort } from '../../domain/ports/CatalogCachePort.js';
import type { CatalogSnapshot } from '../../domain/model/types.js';
import { dataDir } from '../config/paths.js';
import { JsonFileStore } from './JsonFileStore.js';

@Injectable()
export class FileCatalogCache implements CatalogCachePort {
  private readonly logger = new Logger(FileCatalogCache.name);
  private readonly store = new JsonFileStore<CatalogSnapshot>(join(dataDir(), 'catalog.json'));
  private entry: CachedCatalog | undefined;
  private loaded = false;

  read(): CachedCatalog | undefined {
    if (this.entry) return this.entry;
    if (this.loaded) return undefined;

    this.loaded = true;
    const stored = this.store.read();
    if (!stored?.payload?.satellites?.length) return undefined;

    const ageMinutes = Math.round((Date.now() - stored.storedAt) / 60_000);
    this.logger.log(
      `Catalogue repris du disque : ${stored.payload.count} objets, écrit il y a ${ageMinutes} min`,
    );
    this.entry = { snapshot: stored.payload, storedAt: stored.storedAt };
    return this.entry;
  }

  write(snapshot: CatalogSnapshot): void {
    this.entry = { snapshot, storedAt: Date.now() };
    this.loaded = true;
    this.store.write(snapshot);
  }

  clear(): void {
    this.entry = undefined;
    this.loaded = true;
  }
}
