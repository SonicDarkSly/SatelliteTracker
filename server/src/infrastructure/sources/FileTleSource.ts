/**
 * INFRASTRUCTURE — éléments orbitaux lus dans des fichiers locaux.
 *
 * Sert de solution de repli quand Celestrak est indisponible ou limite le débit
 * (HTTP 403 pendant une à deux heures), et permet de travailler entièrement hors
 * ligne. Il suffit de déposer un ou plusieurs fichiers TLE dans
 * `server/data/tle/` : ils sont lus au démarrage, fusionnés avec les autres
 * sources, et c'est toujours le TLE d'époque la plus récente qui gagne.
 *
 * Format attendu : le TLE à trois lignes habituel (nom, ligne 1, ligne 2), tel
 * qu'exporté par Celestrak, Space-Track ou tout autre fournisseur.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { TleFetchResult, TleSourcePort } from '../../domain/ports/TleSourcePort.js';
import { parseTleCatalog } from '../../domain/services/parseTle.js';
import { dataDir } from '../config/paths.js';

/** Extensions reconnues comme fichiers d'éléments orbitaux. */
const TLE_EXTENSIONS = ['.tle', '.txt', '.3le'];

export function tleDir(): string {
  return process.env.TLE_DIR ?? join(dataDir(), 'tle');
}

/** Fichiers TLE présents, ou tableau vide si le dossier n'existe pas. */
export function localTleFiles(): string[] {
  const dir = tleDir();
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => TLE_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

export class FileTleSource implements TleSourcePort {
  readonly id = 'fichiers-locaux';
  readonly label = 'Fichiers TLE locaux (server/data/tle)';
  private readonly logger = new Logger(FileTleSource.name);

  fetchTles(): Promise<TleFetchResult> {
    const files = localTleFiles();
    if (files.length === 0) {
      return Promise.resolve({
        sourceId: this.id,
        label: this.label,
        satellites: [],
        ok: false,
        error: `aucun fichier dans ${tleDir()}`,
      });
    }

    const texts: string[] = [];
    for (const file of files) {
      try {
        texts.push(readFileSync(file, 'utf8'));
      } catch (err) {
        this.logger.warn(
          `${file} illisible : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Pas de filtrage sur l'âge des TLE ici : si l'utilisateur fournit un fichier,
    // c'est qu'il veut s'en servir. L'ancienneté est signalée dans la fiche.
    const { satellites, skipped } = parseTleCatalog(texts.join('\n'));
    this.logger.log(
      `${files.length} fichier(s) local(aux) : ${satellites.length} objets` +
        (skipped > 0 ? ` · ${skipped} entrées ignorées (format)` : ''),
    );

    return Promise.resolve({
      sourceId: this.id,
      label: this.label,
      satellites,
      ok: satellites.length > 0,
      error: satellites.length === 0 ? 'aucun TLE valide dans les fichiers fournis' : undefined,
    });
  }
}
