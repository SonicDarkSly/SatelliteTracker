/**
 * INFRASTRUCTURE — mémoire du blocage des sources, conservée sur disque.
 *
 * Raison d'être : `blockedUntil` ne vivait qu'en mémoire. Refuser d'insister
 * pendant dix minutes ne sert à rien si l'information disparaît au premier
 * redémarrage — c'est le corollaire déjà appris pour le catalogue, appliqué
 * cette fois à l'échec lui-même.
 *
 * Le cas concret : un lancement à froid démarre le serveur deux fois en une
 * seconde (`tsc -w` réémet `dist/`, `node --watch` relance), et le
 * préchargement du bootstrap repart à chaque fois. Deux appels à une seconde
 * d'intervalle sur une adresse déjà surveillée par Celestrak, et le 403 tombe.
 * Avec cette persistance, la deuxième instance lit le blocage et n'appelle pas.
 */
import { join } from 'node:path';
import { dataDir } from '../config/paths.js';
import { JsonFileStore } from '../cache/JsonFileStore.js';

/** État de blocage d'une source, tel qu'il survit à un redémarrage. */
export interface SourceBackoff {
  /** Instant avant lequel toute nouvelle tentative est inutile (ms epoch). */
  blockedUntil: number;
  /** Attente courante, doublée à chaque refus consécutif (ms). */
  backoffMs: number;
}

type BackoffMap = Record<string, SourceBackoff>;

/**
 * Un seul fichier pour toutes les sources, chargé une fois puis tenu en
 * mémoire : les sources sont créées par une fabrique sans injection, un
 * singleton de module est ici plus simple qu'un provider et sans effet de bord.
 */
class SourceBackoffStore {
  private readonly store = new JsonFileStore<BackoffMap>(join(dataDir(), 'backoff.json'), 1);
  private map: BackoffMap | undefined;

  private load(): BackoffMap {
    if (!this.map) {
      const stored = this.store.read();
      // Un état périmé n'a aucune valeur : on repart propre plutôt que de
      // traîner des entrées de sources qui n'existent peut-être plus.
      this.map = Object.fromEntries(
        Object.entries(stored?.payload ?? {}).filter(
          ([, s]) => typeof s?.blockedUntil === 'number' && s.blockedUntil > Date.now(),
        ),
      );
    }
    return this.map;
  }

  read(sourceId: string): SourceBackoff | undefined {
    return this.load()[sourceId];
  }

  write(sourceId: string, state: SourceBackoff): void {
    const map = this.load();
    map[sourceId] = state;
    this.store.write(map);
  }

  /** Accès rétabli : on oublie le blocage pour ne pas le relire au prochain démarrage. */
  clear(sourceId: string): void {
    const map = this.load();
    if (!(sourceId in map)) return;
    delete map[sourceId];
    this.store.write(map);
  }
}

const instance = new SourceBackoffStore();

export function sourceBackoffStore(): SourceBackoffStore {
  return instance;
}
