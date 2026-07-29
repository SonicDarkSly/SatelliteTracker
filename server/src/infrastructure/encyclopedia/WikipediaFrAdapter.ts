/**
 * INFRASTRUCTURE — notices depuis Wikipédia en français.
 *
 * On interroge l'API REST de résumé (`/api/rest_v1/page/summary/<titre>`) avec un
 * titre d'article connu, porté par la famille : pas de recherche plein texte, donc
 * pas de résultat approximatif et au plus une cinquantaine de titres distincts
 * pour tout le catalogue.
 *
 * Les réponses sont conservées en mémoire et sur disque : une notice
 * encyclopédique ne change pas d'un jour à l'autre, et cela évite de solliciter
 * Wikipédia à chaque clic. Le contenu est sous licence CC BY-SA, d'où
 * l'attribution renvoyée avec le texte et affichée par le client.
 */
import { Injectable, Logger } from '@nestjs/common';
import { join } from 'node:path';
import type { EncyclopediaEntry, EncyclopediaPort } from '../../domain/ports/EncyclopediaPort.js';
import { DEFAULT_HEADERS, fetchWithTimeout } from '../http/fetch.js';
import { dataDir } from '../config/paths.js';
import { JsonFileStore } from '../cache/JsonFileStore.js';

/** Durée de validité d'une notice (30 jours). */
const ENTRY_TTL_MS = 30 * 24 * 3_600_000;

interface CachedEntry {
  title: string;
  entry: EncyclopediaEntry | null;
  storedAt: number;
}

interface SummaryResponse {
  title?: string;
  extract?: string;
  type?: string;
  content_urls?: { desktop?: { page?: string } };
}

@Injectable()
export class WikipediaFrAdapter implements EncyclopediaPort {
  private readonly logger = new Logger(WikipediaFrAdapter.name);
  private readonly store = new JsonFileStore<CachedEntry[]>(join(dataDir(), 'notices.json'));
  private cache: Map<string, CachedEntry> | undefined;

  async lookup(title: string): Promise<EncyclopediaEntry | undefined> {
    const cache = this.load();
    const cached = cache.get(title);
    if (cached && Date.now() - cached.storedAt < ENTRY_TTL_MS) {
      return cached.entry ?? undefined;
    }

    const entry = await this.fetchSummary(title);
    // On mémorise aussi les absences (`null`) pour ne pas réinterroger en boucle
    // un titre qui n'existe pas.
    cache.set(title, { title, entry: entry ?? null, storedAt: Date.now() });
    this.store.write([...cache.values()]);
    return entry;
  }

  private async fetchSummary(title: string): Promise<EncyclopediaEntry | undefined> {
    const url = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title.replace(/ /g, '_'),
    )}`;

    try {
      const response = await fetchWithTimeout(
        url,
        { headers: { ...DEFAULT_HEADERS, Accept: 'application/json' } },
        10_000,
      );
      if (response.status === 404) return undefined;
      if (!response.ok) {
        this.logger.warn(`${title} : HTTP ${response.status}`);
        return undefined;
      }

      const data = (await response.json()) as SummaryResponse;
      // Une page d'homonymie ne décrit rien : on la traite comme une absence.
      if (!data.extract || data.type === 'disambiguation') return undefined;

      return {
        title: data.title ?? title,
        extract: data.extract,
        url: data.content_urls?.desktop?.page ?? `https://fr.wikipedia.org/wiki/${title}`,
        attribution: 'Wikipédia en français, licence CC BY-SA 4.0',
      };
    } catch (err) {
      this.logger.warn(`${title} : ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  private load(): Map<string, CachedEntry> {
    if (this.cache) return this.cache;

    this.cache = new Map();
    const stored = this.store.read();
    for (const item of stored?.payload ?? []) this.cache.set(item.title, item);
    if (this.cache.size > 0) {
      this.logger.log(`Notices reprises du disque : ${this.cache.size}`);
    }
    return this.cache;
  }
}
