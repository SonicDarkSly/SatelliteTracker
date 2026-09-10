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
import { mergeStationModules } from '../domain/services/mergeStationModules.js';
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
 * Temps maximal qu'une requête HTTP consacre à attendre une récupération en cours.
 * Au-delà, on répond avec ce qu'on a plutôt que de laisser la page figée.
 */
const RESPONSE_BUDGET_MS = 4000;

/** Instantané vide, servi quand aucune donnée n'est disponible. */
function emptySnapshot(): CatalogSnapshot {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    fetchedAt: now,
    stale: false,
    count: 0,
    satellites: [],
    categories: [],
    regimes: [],
    owners: [],
    families: {},
    sources: [],
    warnings: [],
  };
}

/**
 * Taille en dessous de laquelle un catalogue accompagné d'un avertissement est
 * jugé invraisemblable. Le catalogue réel compte plus de 15 000 objets ; quelques
 * centaines signifient qu'une source majeure a échoué (typiquement `active` en
 * 403) et que seuls des groupes secondaires ont répondu. Un tel résultat est
 * affiché mais jamais écrit sur disque : sinon il resterait servi des heures.
 */
const MIN_PLAUSIBLE_CATALOG = 1000;

/**
 * Délai avant de retenter après un résultat non exploitable (5 min).
 * Assez court pour se rétablir vite quand une source revient, assez long pour
 * qu'un rechargement de page en boucle ne se traduise pas en requêtes réseau.
 */
const UNUSABLE_RETRY_INTERVAL_MS = 5 * 60 * 1000;

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

  /**
   * Dernier résultat non exploitable (vide, ou trop incomplet pour être mis en
   * cache), avec l'heure de la tentative.
   *
   * Sans lui, l'absence de mise en cache se transforme en boucle : chaque requête
   * du client relance un cycle complet de sources, puisqu'il n'y a rien à servir.
   * Mesuré sur le journal réel : 71 appels à Celestrak avec une médiane de 11 s
   * entre deux, dont un à 1 s d'intervalle — de quoi déclencher la limite de débit
   * et rester bloqué. C'est ce qui est arrivé.
   */
  private lastUnusable: { snapshot: CatalogSnapshot; attemptedAt: number } | undefined;

  /**
   * Dernier état connu des sources, conservé hors instantané.
   *
   * L'instantané provisoire renvoyé quand le budget de réponse est dépassé
   * partait avec `sources: []` : le client n'avait donc plus rien à afficher et
   * restait sur un voile « récupération en cours » muet, sans le motif de l'échec
   * ni le décompte. On rejoue donc le dernier état connu dans ce provisoire.
   */
  private lastStatuses: SourceStatus[] = [];
  private lastWarnings: string[] = [];

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

    /*
     * Résultat non exploitable obtenu récemment : on le resserre tel quel plutôt
     * que de relancer les sources. Vaut aussi bien pour un catalogue vide que pour
     * un catalogue trop incomplet — les deux cas ne sont pas mis en cache, et sans
     * ce garde-fou l'absence de cache devient une boucle de requêtes.
     */
    if (
      this.lastUnusable &&
      Date.now() - this.lastUnusable.attemptedAt < UNUSABLE_RETRY_INTERVAL_MS
    ) {
      return this.echeanceHonnete(this.lastUnusable);
    }

    if (this.inFlight) return this.withResponseBudget(this.inFlight);

    this.inFlight = this.refresh().finally(() => {
      this.inFlight = undefined;
    });
    return this.withResponseBudget(this.inFlight);
  }

  /**
   * Limite le temps qu'une requête HTTP passe à attendre une récupération.
   *
   * Le groupe « active » pèse plusieurs mégaoctets et le serveur distant peut
   * mettre une minute à répondre — voire échouer après le délai. Sans plafond, la
   * page restait figée tout ce temps : mesuré à 63 s sur un incident réel, la
   * pire expérience possible pour un utilisateur qui ne sait pas ce qui se passe.
   *
   * Passé le budget, on renvoie ce qu'on a (cache ou instantané vide) en signalant
   * `fetching` : le client affiche l'état et redemande quelques secondes plus tard,
   * pendant que la récupération se poursuit en tâche de fond.
   */
  /**
   * Instantané inexploitable resservi, avec une échéance qui dit vrai.
   *
   * L'instantané est figé à l'instant de la tentative : son `retryAt` vient des
   * sources et ignore le garde-fou de 5 min de ce service. Une fois cet instant
   * dépassé, le client relançait à l'échéance annoncée, se faisait resservir le
   * même instantané — donc la même échéance, déjà passée — et restait bloqué sur
   * « nouvelle tentative en cours » sans que rien ne reparte jamais. Constaté en
   * vrai : décompte à zéro à 09:47:20, une requête à 09:47:22 court-circuitée,
   * puis plus rien. On annonce donc l'instant où une tentative sera réellement
   * possible, jamais un instant déjà passé.
   */
  private echeanceHonnete(unusable: { snapshot: CatalogSnapshot; attemptedAt: number }): CatalogSnapshot {
    const auPlusTot = unusable.attemptedAt + UNUSABLE_RETRY_INTERVAL_MS;
    const sources = unusable.snapshot.sources.map((source) => {
      if (source.ok) return source;
      const annonce = source.retryAt ? Date.parse(source.retryAt) : Number.NaN;
      const reel = Number.isFinite(annonce) ? Math.max(annonce, auPlusTot) : auPlusTot;
      return { ...source, retryAt: new Date(reel).toISOString() };
    });
    return { ...unusable.snapshot, sources };
  }

  private withResponseBudget(pending: Promise<CatalogSnapshot>): Promise<CatalogSnapshot> {
    return new Promise<CatalogSnapshot>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const cached = this.cache.read();
        const base = cached?.snapshot ?? emptySnapshot();
        resolve({
          ...base,
          fetching: true,
          // On préserve l'état connu des sources : c'est la seule information
          // exploitable par le client tant que la récupération n'a pas abouti.
          sources: base.sources.length > 0 ? base.sources : this.lastStatuses,
          warnings: base.warnings.length > 0 ? base.warnings : this.lastWarnings,
        });
      }, RESPONSE_BUDGET_MS);

      pending
        .then((snapshot) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(snapshot);
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(emptySnapshot());
        });
    });
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
        retryAt: result.retryAt ? new Date(result.retryAt).toISOString() : undefined,
      });
      warnings.push(
        fallback
          ? `${result.label} indisponible (${result.error ?? 'erreur'}) — lot précédent réutilisé`
          : `${result.label} indisponible : ${result.error ?? 'erreur'}`,
      );
    }

    // Mémorisé avant toute sortie anticipée : le client doit pouvoir afficher le
    // motif d'échec même si l'instantané servi est provisoire.
    this.lastStatuses = statuses;
    this.lastWarnings = warnings;

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

    // L'enrichissement calcule la famille, dont dépend le regroupement des
    // modules de station : l'ordre des deux étapes compte.
    const satellites = mergeStationModules(await this.enrich(merged, warnings));

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
    const usable = satellites.length > 0 && !suspicious;

    // Tout résultat non mis en cache est mémorisé ici : c'est ce qui empêche la
    // boucle de requêtes décrite sur `lastUnusable`.
    this.lastUnusable = usable ? undefined : { snapshot, attemptedAt: Date.now() };

    if (usable) {
      this.cache.write(snapshot);
    } else if (suspicious) {
      this.logger.warn(
        `Catalogue de ${satellites.length} objets avec avertissements — non mis en cache ` +
          `(une source majeure a échoué). Nouvelle tentative dans ` +
          `${UNUSABLE_RETRY_INTERVAL_MS / 60_000} min au plus tôt.`,
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
