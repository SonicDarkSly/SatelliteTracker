/**
 * INFRASTRUCTURE — petit magasin JSON sur disque, écriture atomique.
 *
 * Raison d'être : Celestrak limite le débit et renvoie HTTP 403 pendant un
 * moment quand on redemande les mêmes données trop souvent. Sans persistance,
 * chaque redémarrage du serveur (et `node --watch` en enchaîne beaucoup en
 * développement) relançait le téléchargement complet — le meilleur moyen de se
 * faire bloquer. Les données survivent maintenant aux redémarrages.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';

export interface StoredEnvelope<T> {
  /** Horodatage d'écriture (ms epoch). */
  storedAt: number;
  /** Version du format ; une valeur inattendue fait ignorer le fichier. */
  version: number;
  payload: T;
}

export class JsonFileStore<T> {
  private readonly logger = new Logger(JsonFileStore.name);

  constructor(
    private readonly path: string,
    private readonly version = 1,
  ) {}

  read(): StoredEnvelope<T> | undefined {
    try {
      if (!existsSync(this.path)) return undefined;
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as StoredEnvelope<T>;
      if (parsed?.version !== this.version || typeof parsed.storedAt !== 'number') {
        this.logger.warn(`${this.path} : format inattendu — fichier ignoré`);
        return undefined;
      }
      return parsed;
    } catch (err) {
      this.logger.warn(
        `${this.path} illisible (${err instanceof Error ? err.message : String(err)}) — ignoré`,
      );
      return undefined;
    }
  }

  /**
   * Écriture via fichier temporaire puis renommage : une coupure en cours
   * d'écriture ne laisse pas un JSON tronqué qui serait ensuite illisible.
   */
  write(payload: T): boolean {
    const envelope: StoredEnvelope<T> = { storedAt: Date.now(), version: this.version, payload };
    const tmp = `${this.path}.tmp`;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(tmp, JSON.stringify(envelope), 'utf8');
      renameSync(tmp, this.path);
      return true;
    } catch (err) {
      this.logger.warn(
        `${this.path} non écrit (${err instanceof Error ? err.message : String(err)})`,
      );
      return false;
    }
  }
}
