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
  /**
   * Version 2 : les enregistrements portent un bloc `omm` là où la version 1
   * stockait les deux lignes d'un TLE.
   *
   * Le numéro de version doit être incrémenté à **chaque** changement de forme des
   * enregistrements. Sans cela, un fichier écrit par une version précédente est
   * relu tel quel et servi au client, qui reçoit des objets amputés du champ dont
   * il a besoin — panne totale et silencieuse, sans le moindre message d'erreur.
   */
  private readonly store = new JsonFileStore<CatalogSnapshot>(join(dataDir(), 'catalog.json'), 2);
  private entry: CachedCatalog | undefined;
  private loaded = false;

  read(): CachedCatalog | undefined {
    if (this.entry) return this.entry;
    if (this.loaded) return undefined;

    this.loaded = true;
    const stored = this.store.read();
    if (!stored?.payload?.satellites?.length) return undefined;

    // Ceinture et bretelles : on vérifie aussi la forme réelle du premier
    // enregistrement. Un fichier au bon numéro de version mais au mauvais
    // contenu (édition manuelle, version intermédiaire) serait sinon servi.
    if (!stored.payload.satellites[0]?.omm) {
      this.logger.warn('Catalogue en cache sans éléments OMM — ignoré, une récupération suivra.');
      return undefined;
    }

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
