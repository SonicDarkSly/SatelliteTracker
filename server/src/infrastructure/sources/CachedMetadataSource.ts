/**
 * INFRASTRUCTURE — décorateur de cache autour d'une source de métadonnées.
 *
 * Le SATCAT pèse plusieurs mégaoctets et ne bouge qu'au rythme des lancements :
 * le retélécharger à chaque démarrage du serveur est à la fois inutile et le
 * meilleur moyen de se faire limiter par Celestrak. Le registre est donc conservé
 * sur disque (`server/data/satcat.json`) et rechargé sans appel réseau tant qu'il
 * est dans sa durée de validité.
 *
 * C'est un adapter qui décore un autre adapter : le port et l'application
 * ignorent complètement l'existence de ce cache.
 */
import { Injectable, Logger } from '@nestjs/common';
import { join } from 'node:path';
import type {
  MetadataFetchResult,
  SatelliteMetadata,
  SatelliteMetadataPort,
} from '../../domain/ports/SatelliteMetadataPort.js';
import { dataDir } from '../config/paths.js';
import { satcatTtlMs } from '../config/celestrak.js';
import { JsonFileStore } from '../cache/JsonFileStore.js';
import { CelestrakSatcatSource } from './CelestrakSatcatSource.js';

/** Le JSON ne sait pas sérialiser une Map : on stocke un tableau. */
type StoredMetadata = SatelliteMetadata[];

@Injectable()
export class CachedMetadataSource implements SatelliteMetadataPort {
  readonly id: string;
  readonly label: string;

  private readonly logger = new Logger(CachedMetadataSource.name);
  private readonly store = new JsonFileStore<StoredMetadata>(join(dataDir(), 'satcat.json'));
  private readonly inner: SatelliteMetadataPort;
  private memory: { byNoradId: Map<string, SatelliteMetadata>; storedAt: number } | undefined;

  constructor() {
    this.inner = new CelestrakSatcatSource();
    this.id = this.inner.id;
    this.label = this.inner.label;
  }

  async fetchMetadata(): Promise<MetadataFetchResult> {
    const cached = this.readCache();
    if (cached && Date.now() - cached.storedAt < satcatTtlMs()) {
      return { sourceId: this.id, label: this.label, byNoradId: cached.byNoradId, ok: true };
    }

    const fresh = await this.inner.fetchMetadata();
    if (fresh.ok && fresh.byNoradId.size > 0) {
      this.memory = { byNoradId: fresh.byNoradId, storedAt: Date.now() };
      this.store.write([...fresh.byNoradId.values()]);
      return fresh;
    }

    // Échec réseau : on sert le registre périmé plutôt que rien — un propriétaire
    // vieux de quelques semaines reste juste, contrairement à une position orbitale.
    if (cached) {
      this.logger.warn(
        `${fresh.error ?? 'erreur'} — registre du disque réutilisé (${cached.byNoradId.size} objets)`,
      );
      return { sourceId: this.id, label: this.label, byNoradId: cached.byNoradId, ok: true };
    }
    return fresh;
  }

  private readCache(): { byNoradId: Map<string, SatelliteMetadata>; storedAt: number } | undefined {
    if (this.memory) return this.memory;

    const stored = this.store.read();
    if (!stored?.payload?.length) return undefined;

    const byNoradId = new Map<string, SatelliteMetadata>();
    for (const meta of stored.payload) byNoradId.set(meta.noradId.padStart(5, '0'), meta);

    const ageHours = Math.round((Date.now() - stored.storedAt) / 3_600_000);
    this.logger.log(
      `Registre repris du disque : ${byNoradId.size} objets, écrit il y a ${ageHours} h`,
    );
    this.memory = { byNoradId, storedAt: stored.storedAt };
    return this.memory;
  }
}
