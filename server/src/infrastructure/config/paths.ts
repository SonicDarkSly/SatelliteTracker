/** INFRASTRUCTURE — emplacements de données locales (gitignorés). */
import { join } from 'node:path';

/**
 * Dossier de travail : `server/data/`. Contient le catalogue et le registre mis
 * en cache. Surchargeable par DATA_DIR.
 */
export function dataDir(): string {
  return process.env.DATA_DIR ?? join(__dirname, '..', '..', '..', 'data');
}
