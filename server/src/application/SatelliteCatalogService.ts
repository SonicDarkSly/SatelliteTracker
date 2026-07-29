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
import { identifyFamily } from '../domain/services/identifyFamily.js';
import {
  countCategories,
  countOwners,
  countRegimes,
  mergeSatellites,
  usedFamilies,
} from '../domain/services/mergeCatalogs.js';
import { catalogTtlMs } from '../infrastructure/config/celestrak.js';
import { politePause } from '../infrastructure/http/fetch.js';

/** Intervalle minimal entre deux rafraîchissements forcés (5 min). */
const FORCE_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Taille en dessous de laquelle un catalogue accompagné d'un avertissement est
 * jugé invraisemblable. Le catalogue réel compte plus de 15 000 objets ; quelques
 * centaines signifient qu'une source majeure a échoué (typiquement `active` en
 * 403) et que seuls des groupes secondaires ont répondu. Un tel résultat est
 * affiché mais jamais écrit sur disque : sinon il resterait servi des heures.
 */
const MIN_PLAUSIBLE_CATALOG = 1000;

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

    /*
     * Rafraîchissement forcé (bouton de l'interface) : on impose un intervalle
     * minimal. Sans ce garde-fou, quelques clics successifs suffisent à déclencher
     * la limite de débit de Celestrak, qui répond alors 403 pendant une heure.
     */
    if (force && cached && Date.now() - cached.storedAt < FORCE_MIN_INTERVAL_MS) {
      const seconds = Math.ceil(
        (FORCE_MIN_INTERVAL_MS - (Date.now() - cached.storedAt)) / 1000,
      );
      this.logger.log(
        `Rafraîchissement demandé trop tôt (données de ${Math.round((Date.now() - cached.storedAt) / 1000)} s) — ` +
          `cache conservé, nouvelle tentative possible dans ${seconds} s.`,
      );
      return cached.snapshot;
    }

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

    const merged = mergeSatellites(lots);

    /*
     * Garde-fou : si une source a échoué et que le résultat est nettement plus
     * pauvre que le catalogue déjà en cache, on garde le cache. C'est le cas au
     * démarrage quand Celestrak renvoie 403 sur le groupe « active » : les
     * groupes secondaires répondent, et on obtiendrait 439 objets au lieu de
     * 16 000 — un catalogue faux plutôt qu'un catalogue un peu vieux.
     */
    const cached = this.cache.read();
    if (warnings.length > 0 && cached && merged.length < cached.snapshot.count * 0.9) {
      this.logger.warn(
        `Résultat incomplet (${merged.length} objets contre ${cached.snapshot.count} en cache) — ` +
          'catalogue précédent conservé.',
      );
      return { ...cached.snapshot, stale: true, sources: statuses, warnings };
    }

    if (merged.length === 0) {
      this.logger.error('Sources injoignables et aucun cache disponible.');
    }

    const satellites = await this.enrich(merged, warnings);

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
      families: usedFamilies(satellites),
      sources: statuses,
      warnings,
    };

    // Un résultat incomplet et invraisemblablement petit est affiché mais jamais
    // persisté : il serait ensuite servi depuis le disque pendant des heures.
    const suspicious = warnings.length > 0 && satellites.length < MIN_PLAUSIBLE_CATALOG;
    if (satellites.length > 0 && !suspicious) {
      this.cache.write(snapshot);
    } else if (suspicious) {
      this.logger.warn(
        `Catalogue de ${satellites.length} objets avec avertissements — non mis en cache ` +
          '(une source majeure a échoué, le résultat serait trompeur).',
      );
    }

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

    // Sans registre, on rattache quand même chaque objet à une famille : le nom
    // et le régime orbital suffisent dans la plupart des cas.
    if (!table || table.size === 0) {
      return satellites.map((sat) => ({
        ...sat,
        family: identifyFamily(sat.name, sat.categories, sat.regime, undefined),
      }));
    }

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
        // La nature issue du registre affine le rattachement : un étage de
        // lanceur mal nommé serait sinon classé d'après sa mission d'origine.
        family: identifyFamily(sat.name, sat.categories, sat.regime, meta.objectType),
      };
    });

    this.logger.log(
      `SATCAT appliqué : ${matched}/${satellites.length} objets identifiés ` +
        `(propriétaire, nature, lancement)`,
    );
    return enriched;
  }

  /**
   * Registre SATCAT. La mise en cache (mémoire + disque) et le repli sur une
   * copie périmée sont assurés par l'adapter décorateur : ici on se contente
   * d'appeler le port et de signaler une absence de données.
   */
  private async loadMetadata(
    warnings: string[],
  ): Promise<Map<string, SatelliteMetadata> | undefined> {
    await politePause();
    const result = await this.metadataSource.fetchMetadata();

    if (result.ok && result.byNoradId.size > 0) return result.byNoradId;

    warnings.push(
      `${result.label} indisponible : ${result.error ?? 'erreur'} — pays et organismes non renseignés`,
    );
    return undefined;
  }
}
