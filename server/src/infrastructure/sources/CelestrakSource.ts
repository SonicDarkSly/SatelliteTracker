/**
 * INFRASTRUCTURE — adapter Celestrak du port TleSourcePort.
 * Une instance par groupe GP ; le service applicatif les interroge en série
 * avec une pause de courtoisie et fusionne les résultats.
 */
import { Logger } from '@nestjs/common';
import type { TleFetchResult, TleSourcePort } from '../../domain/ports/TleSourcePort.js';
import { parseTleCatalog } from '../../domain/services/parseTle.js';
import { DEFAULT_HEADERS, fetchWithRetry } from '../http/fetch.js';
import { celestrakGroupUrl, celestrakTimeoutMs, maxEpochAgeDays } from '../config/celestrak.js';

/**
 * Attente après un blocage (HTTP 403), progressive.
 *
 * Celestrak bloque temporairement les clients trop insistants, sans annoncer la
 * durée. Une attente fixe d'une heure était le mauvais compromis : plus longue
 * que le blocage réel dans bien des cas, elle prolongeait inutilement la panne
 * côté utilisateur. On sonde donc au bout de 10 min, puis on double à chaque
 * échec jusqu'à 2 h — assez espacé pour ne pas être abusif, assez tôt pour
 * repartir vite dès que l'accès revient.
 */
const BLOCK_BACKOFF_INITIAL_MS = 10 * 60 * 1000;
const BLOCK_BACKOFF_MAX_MS = 2 * 60 * 60 * 1000;

/**
 * Attente après une indisponibilité passagère du service (502, 503, 504) ou un
 * dépassement de délai. À distinguer nettement du blocage pour excès de requêtes :
 * ici le serveur ne nous reproche rien, il est seulement en difficulté. Deux
 * minutes suffisent, là où une heure serait absurde.
 */
const TRANSIENT_BACKOFF_MS = 2 * 60 * 1000;

/** Codes signalant une indisponibilité passagère plutôt qu'un refus. */
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/**
 * Heure locale au format court.
 *
 * Les messages d'erreur finissent dans l'instantané mis en cache sur disque :
 * un délai relatif (« dans 23 min ») y devient faux dès la minute suivante et
 * reste affiché tel quel pendant des heures. Une heure absolue, elle, reste
 * juste et permet de voir d'un coup d'œil que l'information est ancienne.
 */
function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export class CelestrakSource implements TleSourcePort {
  private readonly logger = new Logger(CelestrakSource.name);
  /** Instant avant lequel toute nouvelle tentative est inutile. */
  private blockedUntil = 0;
  /** Attente courante, doublée à chaque 403 consécutif. */
  private backoffMs = BLOCK_BACKOFF_INITIAL_MS;

  constructor(
    readonly id: string,
    readonly label: string,
  ) {}

  async fetchTles(): Promise<TleFetchResult> {
    const url = celestrakGroupUrl(this.id);

    if (Date.now() < this.blockedUntil) {
      return this.failure(
        'accès temporairement refusé par Celestrak (limite de débit) — ' +
          `nouvelle tentative à partir de ${formatTime(this.blockedUntil)}`,
        false,
      );
    }

    try {
      // Une seule tentative : la relance doublait l'attente en cas de lenteur du
      // serveur (deux fois le délai, plus la pause), pour un résultat identique.
      // Le backoff se charge de réessayer plus tard.
      const response = await fetchWithRetry(url, { headers: DEFAULT_HEADERS }, celestrakTimeoutMs(), 0);

      if (response.status === 403) {
        this.blockedUntil = Date.now() + this.backoffMs;
        this.backoffMs = Math.min(this.backoffMs * 2, BLOCK_BACKOFF_MAX_MS);
        return this.failure(
          'HTTP 403 — Celestrak limite le débit (trop de requêtes récentes). ' +
            `Les données en cache restent utilisées ; nouvelle tentative à partir de ${formatTime(this.blockedUntil)}.`,
        );
      }

      if (TRANSIENT_STATUSES.has(response.status)) {
        this.blockedUntil = Date.now() + TRANSIENT_BACKOFF_MS;
        return this.failure(
          `HTTP ${response.status} — service Celestrak momentanément indisponible. ` +
            `Nouvelle tentative à partir de ${formatTime(this.blockedUntil)}.`,
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

      // Accès rétabli : on repart de l'attente initiale pour le prochain incident.
      this.backoffMs = BLOCK_BACKOFF_INITIAL_MS;

      this.logger.log(
        `${this.id} : ${fresh.length} objets` +
          (skipped > 0 ? ` · ${skipped} entrées ignorées (format)` : '') +
          (satellites.length - fresh.length > 0
            ? ` · ${satellites.length - fresh.length} TLE périmés écartés`
            : ''),
      );

      return { sourceId: this.id, label: this.label, satellites: fresh, ok: true };
    } catch (err) {
      // Délai dépassé ou coupure réseau : même traitement qu'une indisponibilité
      // passagère, on laisse le serveur respirer avant de réessayer.
      this.blockedUntil = Date.now() + TRANSIENT_BACKOFF_MS;
      const detail = err instanceof Error ? err.message : String(err);
      const readable = /abort/i.test(detail)
        ? `délai de ${Math.round(celestrakTimeoutMs() / 1000)} s dépassé (serveur lent ou indisponible)`
        : detail;
      return this.failure(
        `${readable} — nouvelle tentative à partir de ${formatTime(this.blockedUntil)}.`,
      );
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
