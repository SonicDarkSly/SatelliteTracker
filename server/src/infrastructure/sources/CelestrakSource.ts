/**
 * INFRASTRUCTURE — adapter Celestrak du port TleSourcePort.
 * Une instance par groupe GP ; le service applicatif les interroge en série
 * avec une pause de courtoisie et fusionne les résultats.
 */
import { Logger } from '@nestjs/common';
import type { TleFetchResult, TleSourcePort } from '../../domain/ports/TleSourcePort.js';
import { parseOmmCatalog } from '../../domain/services/parseOmmCatalog.js';
import { DEFAULT_HEADERS, fetchWithRetry } from '../http/fetch.js';
import { celestrakGroupUrl, celestrakTimeoutMs, maxEpochAgeDays } from '../config/celestrak.js';
import { sourceBackoffStore } from './SourceBackoffStore.js';

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
 * Période de régénération des données GP annoncée par Celestrak.
 *
 * Tant qu'elle n'est pas écoulée depuis le dernier téléchargement servi, toute
 * nouvelle demande est refusée : les données seraient identiques.
 */
const GP_UPDATE_PERIOD_MS = 2 * 60 * 60 * 1000;

/**
 * Refus qui signifie « tu as déjà cette version », et non « tu abuses ».
 *
 * Distinction capitale, et coûteuse à apprendre : les deux arrivent en HTTP 403,
 * mais l'un se résout en attendant la prochaine régénération, l'autre en cessant
 * d'insister. Les confondre a fait afficher « limite de débit (trop de requêtes
 * récentes) » alors que le téléchargement précédent avait tout simplement réussi.
 */
const ALREADY_SERVED = /has not updated since your last successful download/i;

/**
 * Instant à partir duquel une nouvelle tentative a un sens, déduit du message.
 *
 * Celestrak cite l'horodatage du dernier téléchargement servi
 * (« … at 2026-09-10 07:25:34 UTC ») : la prochaine version arrive une période
 * plus tard. Faute d'horodatage exploitable, on attend une période entière.
 */
function nextGpUpdate(body: string): number {
  const match = /at (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC/.exec(body);
  const servedAt = match ? Date.parse(`${match[1]}T${match[2]}Z`) : Number.NaN;
  const base = Number.isFinite(servedAt) ? servedAt : Date.now();
  // Une minute de marge : viser la seconde exacte de la bascule retomberait sur
  // le même refus. Et jamais moins de l'attente initiale, pour le cas où
  // l'horodatage cité resterait figé dans le passé.
  return Math.max(base + GP_UPDATE_PERIOD_MS + 60_000, Date.now() + BLOCK_BACKOFF_INITIAL_MS);
}

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
  /** Le blocage laissé par l'instance précédente n'est relu qu'une fois. */
  private restored = false;

  constructor(
    readonly id: string,
    readonly label: string,
  ) {}

  async fetchTles(): Promise<TleFetchResult> {
    const url = celestrakGroupUrl(this.id);
    this.restoreBackoff();

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
        // Celestrak explique son refus en clair dans le corps de la réponse.
        // L'ignorer nous a coûté une longue enquête pour un diagnostic faux.
        // Espaces normalisés avant toute analyse : le message est replié sur
        // plusieurs lignes, et la coupure tombe au milieu de la phrase
        // reconnue (« … your last successful\ndownload of GROUP=… »).
        const body = (await response.text().catch(() => ''))
          .replace(/\s+/g, ' ')
          .trim();

        if (ALREADY_SERVED.test(body)) {
          this.blockedUntil = nextGpUpdate(body);
          // Aucun tort de notre côté : l'attente ne doit pas s'aggraver.
          this.backoffMs = BLOCK_BACKOFF_INITIAL_MS;
          this.persistBackoff();
          return this.failure(
            'la version courante a déjà été téléchargée depuis cette adresse — Celestrak ne ' +
              'renvoie les mêmes données qu\'après régénération (toutes les 2 h). ' +
              `Nouvelle tentative à partir de ${formatTime(this.blockedUntil)}.`,
          );
        }

        this.blockedUntil = Date.now() + this.backoffMs;
        this.backoffMs = Math.min(this.backoffMs * 2, BLOCK_BACKOFF_MAX_MS);
        this.persistBackoff();
        return this.failure(
          `HTTP 403 — accès refusé par Celestrak${body ? ` : ${body.slice(0, 200)}` : ''} ` +
            `— nouvelle tentative à partir de ${formatTime(this.blockedUntil)}.`,
        );
      }

      if (TRANSIENT_STATUSES.has(response.status)) {
        this.blockedUntil = Date.now() + TRANSIENT_BACKOFF_MS;
        this.persistBackoff();
        return this.failure(
          `HTTP ${response.status} — service Celestrak momentanément indisponible. ` +
            `Nouvelle tentative à partir de ${formatTime(this.blockedUntil)}.`,
        );
      }

      if (!response.ok) {
        return this.failure(`HTTP ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      // Celestrak répond 200 avec un message en clair quand un groupe est inconnu
      // ou que le débit est dépassé : on le détecte sur l'absence de tableau JSON.
      if (!text.trimStart().startsWith('[')) {
        const hint = text.trim().slice(0, 160) || 'réponse vide';
        return this.failure(`réponse inattendue (JSON attendu) — ${hint}`);
      }

      const { satellites, skipped } = parseOmmCatalog(text);
      const fresh = this.dropStaleEpochs(satellites);

      // Accès rétabli : on repart de l'attente initiale pour le prochain incident,
      // et on efface la trace sur disque pour ne pas la relire au démarrage suivant.
      this.backoffMs = BLOCK_BACKOFF_INITIAL_MS;
      this.blockedUntil = 0;
      sourceBackoffStore().clear(this.id);

      this.logger.log(
        `${this.id} : ${fresh.length} objets` +
          (skipped > 0 ? ` · ${skipped} entrées ignorées (format)` : '') +
          (satellites.length - fresh.length > 0
            ? ` · ${satellites.length - fresh.length} jeux d'éléments périmés écartés`
            : ''),
      );

      return { sourceId: this.id, label: this.label, satellites: fresh, ok: true };
    } catch (err) {
      // Délai dépassé ou coupure réseau : même traitement qu'une indisponibilité
      // passagère, on laisse le serveur respirer avant de réessayer.
      this.blockedUntil = Date.now() + TRANSIENT_BACKOFF_MS;
      this.persistBackoff();
      const detail = err instanceof Error ? err.message : String(err);
      const readable = /abort/i.test(detail)
        ? `délai de ${Math.round(celestrakTimeoutMs() / 1000)} s dépassé (serveur lent ou indisponible)`
        : detail;
      return this.failure(
        `${readable} — nouvelle tentative à partir de ${formatTime(this.blockedUntil)}.`,
      );
    }
  }

  /** Écarte les éléments trop anciens : la propagation SGP4 y dérive de plusieurs km. */
  private dropStaleEpochs(satellites: TleFetchResult['satellites']): TleFetchResult['satellites'] {
    const limit = Date.now() - maxEpochAgeDays() * 86_400_000;
    return satellites.filter((s) => Date.parse(s.epoch) >= limit);
  }

  /**
   * Reprise du blocage laissé par l'instance précédente.
   *
   * Sans cela, un redémarrage repartait aussitôt vers Celestrak alors qu'on
   * venait de se faire refuser l'accès — et `node --watch` en enchaîne.
   */
  private restoreBackoff(): void {
    if (this.restored) return;
    this.restored = true;

    const stored = sourceBackoffStore().read(this.id);
    if (!stored || stored.blockedUntil <= Date.now()) return;

    this.blockedUntil = stored.blockedUntil;
    this.backoffMs = Math.min(
      Math.max(stored.backoffMs, BLOCK_BACKOFF_INITIAL_MS),
      BLOCK_BACKOFF_MAX_MS,
    );
    this.logger.log(
      `${this.id} : blocage repris du disque — pas de nouvel appel avant ${formatTime(this.blockedUntil)}`,
    );
  }

  private persistBackoff(): void {
    sourceBackoffStore().write(this.id, {
      blockedUntil: this.blockedUntil,
      backoffMs: this.backoffMs,
    });
  }

  private failure(error: string, log = true): TleFetchResult {
    if (log) this.logger.warn(`${this.id} : ${error}`);
    return {
      sourceId: this.id,
      label: this.label,
      satellites: [],
      ok: false,
      error,
      retryAt: this.blockedUntil > Date.now() ? this.blockedUntil : undefined,
    };
  }
}
