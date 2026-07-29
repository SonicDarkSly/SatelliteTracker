/**
 * INFRASTRUCTURE — adapter Celestrak du port TleSourcePort.
 * Une instance par groupe GP ; le service applicatif les interroge en série
 * avec une pause de courtoisie et fusionne les résultats.
 */
import { Logger } from '@nestjs/common';
import type { TleFetchResult, TleSourcePort } from '../../domain/ports/TleSourcePort.js';
import { parseTleCatalog } from '../../domain/services/parseTle.js';
import { DEFAULT_HEADERS, fetchWithRetry } from '../http/fetch.js';
import { celestrakGroupUrl, maxEpochAgeDays } from '../config/celestrak.js';

/**
 * Durée d'attente après un blocage (HTTP 403). Celestrak bloque temporairement
 * les clients qui redemandent les mêmes données trop souvent ; insister ne fait
 * que prolonger le blocage.
 */
const BLOCK_BACKOFF_MS = 60 * 60 * 1000;

export class CelestrakSource implements TleSourcePort {
  private readonly logger = new Logger(CelestrakSource.name);
  /** Instant avant lequel toute nouvelle tentative est inutile. */
  private blockedUntil = 0;

  constructor(
    readonly id: string,
    readonly label: string,
  ) {}

  async fetchTles(): Promise<TleFetchResult> {
    const url = celestrakGroupUrl(this.id);

    if (Date.now() < this.blockedUntil) {
      const minutes = Math.ceil((this.blockedUntil - Date.now()) / 60_000);
      return this.failure(
        `accès temporairement refusé par Celestrak (limite de débit) — nouvelle tentative dans ${minutes} min`,
        false,
      );
    }

    try {
      const response = await fetchWithRetry(url, { headers: DEFAULT_HEADERS });

      if (response.status === 403) {
        this.blockedUntil = Date.now() + BLOCK_BACKOFF_MS;
        return this.failure(
          'HTTP 403 — Celestrak limite le débit (trop de requêtes récentes). ' +
            'Les données en cache restent utilisées ; nouvelle tentative dans 1 h.',
        );
      }

      if (!response.ok) {
        return this.failure(`HTTP ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      // Celestrak répond 200 avec un message texte quand un groupe est inconnu
      // ou quand le débit est dépassé : on le détecte sur l'absence de TLE.
      if (!/^1 \d{5}/m.test(text)) {
        const hint = text.trim().slice(0, 160) || 'réponse vide';
        return this.failure(`aucun TLE dans la réponse — ${hint}`);
      }

      const { satellites, skipped } = parseTleCatalog(text);
      const fresh = this.dropStaleEpochs(satellites);

      this.logger.log(
        `${this.id} : ${fresh.length} objets` +
          (skipped > 0 ? ` · ${skipped} entrées ignorées (format)` : '') +
          (satellites.length - fresh.length > 0
            ? ` · ${satellites.length - fresh.length} TLE périmés écartés`
            : ''),
      );

      return { sourceId: this.id, label: this.label, satellites: fresh, ok: true };
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : String(err));
    }
  }

  /** Écarte les TLE trop anciens : la propagation SGP4 y dérive de plusieurs km. */
  private dropStaleEpochs(satellites: TleFetchResult['satellites']): TleFetchResult['satellites'] {
    const limit = Date.now() - maxEpochAgeDays() * 86_400_000;
    return satellites.filter((s) => Date.parse(s.epoch) >= limit);
  }

  private failure(error: string, log = true): TleFetchResult {
    if (log) this.logger.warn(`${this.id} : ${error}`);
    return { sourceId: this.id, label: this.label, satellites: [], ok: false, error };
  }
}
