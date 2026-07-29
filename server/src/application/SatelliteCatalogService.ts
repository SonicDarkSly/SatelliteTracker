/**
 * APPLICATION — orchestration du catalogue : récupération des sources, fusion,
 * mise en cache, construction du read model servi au client.
 *
 * Une seule récupération concurrente à la fois (`inFlight`) : dix onglets ouverts
 * ne déclenchent pas dix appels à Celestrak.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CATALOG_CACHE_PORT, METADATA_SOURCE, TLE_SOURCES } from '../app.tokens.js';
import type { CatalogCachePort } from '../domain/ports/CatalogCachePort.js';
import type { TleSourcePort } from '../domain/ports/TleSourcePort.js';
import type {
  SatelliteMetadata,
  SatelliteMetadataPort,
} from '../domain/ports/SatelliteMetadataPort.js';
import type { CatalogSnapshot, SatelliteRecord, SourceStatus } from '../domain/model/types.js';
import { ownerInfo } from '../domain/model/owners.js';
import {
  countCategories,
  countOwners,
  countRegimes,
  mergeSatellites,
} from '../domain/services/mergeCatalogs.js';
import { catalogTtlMs, satcatTtlMs } from '../infrastructure/config/celestrak.js';
import { politePause } from '../infrastructure/http/fetch.js';

@Injectable()
export class SatelliteCatalogService {
  private readonly logger = new Logger(SatelliteCatalogService.name);
  private inFlight: Promise<CatalogSnapshot> | undefined;

  /**
   * Dernier lot valide de chaque source.
   *
   * Sans ce garde-fou, une seule récupération en échec produit un catalogue
   * amputé (par ex. 439 objets au lieu de 16 254 si le groupe « active » n'a pas
   * répondu) qui est ensuite servi pendant toute la durée du cache. On repart
   * donc du dernier lot connu pour les sources défaillantes.
   */
  private readonly lastGoodLots = new Map<string, SatelliteRecord[]>();

  /** SATCAT en mémoire : rarement modifié, coûteux à télécharger (~4 Mo). */
  private metadata: { byNoradId: Map<string, SatelliteMetadata>; storedAt: number } | undefined;

  constructor(
    @Inject(TLE_SOURCES) private readonly sources: TleSourcePort[],
    @Inject(METADATA_SOURCE) private readonly metadataSource: SatelliteMetadataPort,
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

      if (result.ok && result.satellites.length > 0) {
        this.lastGoodLots.set(result.sourceId, result.satellites);
        lots.push(result.satellites);
        statuses.push({
          id: result.sourceId,
          label: result.label,
          count: result.satellites.length,
          ok: true,
        });
        continue;
      }

      // Source en échec : on réutilise son dernier lot valide plutôt que de
      // servir un catalogue amputé.
      const fallback = this.lastGoodLots.get(result.sourceId);
      lots.push(fallback ?? []);
      statuses.push({
        id: result.sourceId,
        label: result.label,
        count: fallback?.length ?? 0,
        ok: false,
        error: result.error,
      });
      warnings.push(
        fallback
          ? `${result.label} indisponible (${result.error ?? 'erreur'}) — lot précédent réutilisé`
          : `${result.label} indisponible : ${result.error ?? 'erreur'}`,
      );
    }

    const satellites = await this.enrich(mergeSatellites(lots), warnings);

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
      owners: countOwners(satellites),
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

  /**
   * Complète les enregistrements avec le SATCAT : propriétaire (pays, agence ou
   * opérateur), nature de l'objet, date et site de lancement. En cas d'échec, le
   * catalogue reste exploitable — seuls ces champs manquent.
   */
  private async enrich(
    satellites: SatelliteRecord[],
    warnings: string[],
  ): Promise<SatelliteRecord[]> {
    const table = await this.loadMetadata(warnings);
    if (!table || table.size === 0) return satellites;

    let matched = 0;
    const enriched = satellites.map((sat) => {
      const meta = table.get(sat.noradId.padStart(5, '0')) ?? table.get(sat.noradId);
      if (!meta) return sat;

      matched++;
      const owner = ownerInfo(meta.owner);
      return {
        ...sat,
        owner: owner.code,
        ownerLabel: owner.label,
        ownerFlag: owner.flag,
        ownerKind: owner.kind,
        objectType: meta.objectType,
        launchDate: meta.launchDate,
        launchSite: meta.launchSite,
        rcsMeters2: meta.rcsMeters2,
      };
    });

    this.logger.log(
      `SATCAT appliqué : ${matched}/${satellites.length} objets identifiés ` +
        `(propriétaire, nature, lancement)`,
    );
    return enriched;
  }

  /** SATCAT depuis le cache mémoire, sinon récupération. */
  private async loadMetadata(
    warnings: string[],
  ): Promise<Map<string, SatelliteMetadata> | undefined> {
    if (this.metadata && Date.now() - this.metadata.storedAt < satcatTtlMs()) {
      return this.metadata.byNoradId;
    }

    await politePause();
    const result = await this.metadataSource.fetchMetadata();

    if (result.ok && result.byNoradId.size > 0) {
      this.metadata = { byNoradId: result.byNoradId, storedAt: Date.now() };
      return result.byNoradId;
    }

    warnings.push(
      this.metadata
        ? `${result.label} indisponible (${result.error ?? 'erreur'}) — registre précédent réutilisé`
        : `${result.label} indisponible : ${result.error ?? 'erreur'} — pays et organismes non renseignés`,
    );
    return this.metadata?.byNoradId;
  }
}
