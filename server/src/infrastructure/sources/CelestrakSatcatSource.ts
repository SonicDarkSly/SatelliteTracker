/**
 * INFRASTRUCTURE — adapter du SATCAT Celestrak (`satcat.csv`).
 *
 * Le SATCAT est le registre du catalogue : une ligne par objet jamais lancé,
 * avec son propriétaire, sa nature, sa date de lancement. Il pèse ~4 Mo et ne
 * bouge qu'au rythme des lancements — d'où un cache long (24 h par défaut) et
 * une récupération indépendante de celle des TLE.
 *
 * Colonnes utilisées : OBJECT_ID, NORAD_CAT_ID, OBJECT_TYPE, OWNER,
 * LAUNCH_DATE, LAUNCH_SITE, RCS.
 */
import { Logger } from '@nestjs/common';
import type {
  MetadataFetchResult,
  SatelliteMetadata,
  SatelliteMetadataPort,
} from '../../domain/ports/SatelliteMetadataPort.js';
import type { ObjectType } from '../../domain/model/types.js';
import { DEFAULT_HEADERS, fetchWithRetry } from '../http/fetch.js';
import { satcatUrl } from '../config/celestrak.js';

/** Découpe une ligne CSV en respectant les champs entre guillemets. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // Guillemet doublé à l'intérieur d'un champ cité = guillemet littéral.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  out.push(current);
  return out;
}

const OBJECT_TYPES: ObjectType[] = ['PAY', 'R/B', 'DEB', 'UNK'];

function toObjectType(raw: string): ObjectType {
  const value = raw.trim().toUpperCase();
  return (OBJECT_TYPES as string[]).includes(value) ? (value as ObjectType) : 'UNK';
}

export class CelestrakSatcatSource implements SatelliteMetadataPort {
  readonly id = 'satcat';
  readonly label = 'SATCAT (registre du catalogue)';
  private readonly logger = new Logger(CelestrakSatcatSource.name);

  async fetchMetadata(): Promise<MetadataFetchResult> {
    try {
      const response = await fetchWithRetry(satcatUrl(), { headers: DEFAULT_HEADERS }, 45_000);
      if (!response.ok) {
        return this.failure(`HTTP ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const byNoradId = this.parse(text);
      if (byNoradId.size === 0) {
        return this.failure('aucune ligne exploitable dans le SATCAT');
      }

      this.logger.log(`SATCAT : ${byNoradId.size} objets référencés`);
      return { sourceId: this.id, label: this.label, byNoradId, ok: true };
    } catch (err) {
      return this.failure(err instanceof Error ? err.message : String(err));
    }
  }

  /** Analyse le CSV en s'appuyant sur l'en-tête (l'ordre des colonnes peut changer). */
  private parse(text: string): Map<string, SatelliteMetadata> {
    const lines = text.split(/\r?\n/);
    const result = new Map<string, SatelliteMetadata>();
    if (lines.length < 2) return result;

    const header = splitCsvLine(lines[0]).map((h) => h.trim().toUpperCase());
    const col = (name: string): number => header.indexOf(name);
    const iNorad = col('NORAD_CAT_ID');
    const iOwner = col('OWNER');
    const iType = col('OBJECT_TYPE');
    const iLaunch = col('LAUNCH_DATE');
    const iSite = col('LAUNCH_SITE');
    const iRcs = col('RCS');

    if (iNorad < 0) {
      this.logger.warn('SATCAT : colonne NORAD_CAT_ID absente — en-tête inattendu');
      return result;
    }

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const cells = splitCsvLine(lines[i]);
      const noradId = cells[iNorad]?.trim();
      if (!noradId) continue;

      const rcsRaw = iRcs >= 0 ? Number(cells[iRcs]) : Number.NaN;
      const launch = iLaunch >= 0 ? cells[iLaunch]?.trim() : '';

      result.set(noradId.padStart(5, '0'), {
        noradId,
        owner: iOwner >= 0 ? (cells[iOwner]?.trim() ?? '') : '',
        objectType: iType >= 0 ? toObjectType(cells[iType] ?? '') : 'UNK',
        launchDate: launch || undefined,
        launchSite: iSite >= 0 ? cells[iSite]?.trim() || undefined : undefined,
        rcsMeters2: Number.isFinite(rcsRaw) && rcsRaw > 0 ? rcsRaw : undefined,
      });
    }

    return result;
  }

  private failure(error: string): MetadataFetchResult {
    this.logger.warn(`SATCAT : ${error}`);
    return {
      sourceId: this.id,
      label: this.label,
      byNoradId: new Map(),
      ok: false,
      error,
    };
  }
}
