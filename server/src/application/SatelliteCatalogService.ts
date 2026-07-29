/**
 * APPLICATION — orchestration du catalogue : récupération des sources, fusion,
 * mise en cache, construction du read model servi au client.
 *
 * Une seule récupération concurrente à la fois (`inFlight`) : dix onglets ouverts
 * ne déclenchent pas dix appels à Celestrak.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CATALOG_CACHE_PORT, TLE_SOURCES } from '../app.tokens.js';
import type { CatalogCachePort } from '../domain/ports/CatalogCachePort.js';
import type { TleSourcePort } from '../domain/ports/TleSourcePort.js';
import type { CatalogSnapshot, SatelliteRecord, SourceStatus } from '../domain/model/types.js';
import {
  countCategories,
  countRegimes,
  mergeSatellites,
} from '../domain/services/mergeCatalogs.js';
import { catalogTtlMs } from '../infrastructure/config/celestrak.js';
import { politePause } from '../infrastructure/http/fetch.js';

@Injectable()
export class SatelliteCatalogService {
  private readonly logger = new Logger(SatelliteCatalogService.name);
  private inFlight: Promise<CatalogSnapshot> | undefined;

  constructor(
    @Inject(TLE_SOURCES) private readonly sources: TleSourcePort[],
    @Inject(CATALOG_CACHE_PORT) private readonly cache: CatalogCachePort,
  ) {}

  /**
   * Instantané du catalogue.
   * @param force ignore le cache encore valide (bouton « rafraîchir »)
   */
  async getSnapshot(force = false): Promise<CatalogSnapshot> {
    const cached = this.cache.read();
    const fresh = cached !== undefined && Date.now() - cached.storedAt < catalogTtlMs();

    if (!force && cached && fresh) return cached.snapshot;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.refresh().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** Un satellite par n° NORAD, depuis le catalogue courant. */
  async findByNoradId(noradId: string): Promise<SatelliteRecord | undefined> {
    const snapshot = await this.getSnapshot();
    return snapshot.satellites.find((s) => s.noradId === noradId.padStart(5, '0').trim())
      ?? snapshot.satellites.find((s) => s.noradId === noradId);
  }

  /** Interroge toutes les sources, fusionne et met en cache. */
  private async refresh(): Promise<CatalogSnapshot> {
    const startedAt = Date.now();
    const lots: SatelliteRecord[][] = [];
    const statuses: SourceStatus[] = [];
    const warnings: string[] = [];

    for (const [index, source] of this.sources.entries()) {
      if (index > 0) await politePause();

      const result = await source.fetchTles();
      lots.push(result.satellites);
      statuses.push({
        id: result.sourceId,
        label: result.label,
        count: result.satellites.length,
        ok: result.ok,
        error: result.error,
      });
      if (!result.ok) warnings.push(`${result.label} indisponible : ${result.error ?? 'erreur'}`);
    }

    const satellites = mergeSatellites(lots);

    // Toutes les sources en échec : on préfère servir un cache périmé plutôt que rien.
    if (satellites.length === 0) {
      const cached = this.cache.read();
      if (cached) {
        this.logger.warn(
          'Sources injoignables — catalogue servi depuis le cache précédent (données périmées).',
        );
        return { ...cached.snapshot, stale: true, sources: statuses, warnings };
      }
      this.logger.error('Sources injoignables et aucun cache disponible.');
    }

    const now = new Date().toISOString();
    const snapshot: CatalogSnapshot = {
      generatedAt: now,
      fetchedAt: now,
      stale: false,
      count: satellites.length,
      satellites,
      categories: countCategories(satellites),
      regimes: countRegimes(satellites),
      sources: statuses,
      warnings,
    };

    if (satellites.length > 0) this.cache.write(snapshot);

    this.logger.log(
      `Catalogue prêt : ${satellites.length} objets en ${((Date.now() - startedAt) / 1000).toFixed(1)} s ` +
        `(${statuses.filter((s) => s.ok).length}/${statuses.length} sources)`,
    );
    return snapshot;
  }
}
