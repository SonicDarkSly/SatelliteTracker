/**
 * Bootstrap NestJS.
 * Architecture (hexagonale, CQRS via @nestjs/cqrs) :
 *   domain/         modèle métier (TLE, régimes orbitaux), ports, services de domaine
 *   application/    queries (GetCatalog, GetFacets, GetSatellite) + command (RefreshCatalog)
 *   infrastructure/ adapters : source Celestrak, cache mémoire, config, HTTP
 *   interface/      contrôleur HTTP
 *
 * Le serveur ne calcule aucune position : il ingère, valide, catégorise et met
 * en cache les éléments orbitaux. La propagation SGP4 se fait dans le navigateur
 * (WebWorker), ce qui permet d'animer plus de 10 000 objets sans charge serveur.
 */
import 'reflect-metadata';
import { createWriteStream, mkdirSync } from 'node:fs';
import type { WriteStream } from 'node:fs';
import { join } from 'node:path';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import { AppModule } from './app.module.js';
import { loadEnv } from './infrastructure/config/loadEnv.js';
import { catalogTtlMs, configuredGroups, maxEpochAgeDays } from './infrastructure/config/celestrak.js';
import { localTleFiles, tleDir } from './infrastructure/sources/FileTleSource.js';
import { SatelliteCatalogService } from './application/SatelliteCatalogService.js';

/** Date + heure locales, format FR : 29/07/2026 14:32:10 */
function horodatage(): string {
  return new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Retire les codes couleur ANSI (pour le fichier journal). */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Logger qui recopie toutes les logs dans un fichier en clair tout en gardant
 * la sortie colorée habituelle en console.
 */
class FileTeeLogger extends ConsoleLogger {
  constructor(private readonly stream: WriteStream) {
    super();
  }

  private tee(level: string, message: unknown, params: unknown[]): void {
    const context =
      params.length > 0 && typeof params[params.length - 1] === 'string'
        ? (params[params.length - 1] as string)
        : (this.context ?? '');
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    this.stream.write(`${horodatage()} [${context || level}] ${stripAnsi(text)}\n`);
  }

  log(message: unknown, ...params: unknown[]): void {
    this.tee('LOG', message, params);
    super.log(message as never, ...(params as never[]));
  }
  error(message: unknown, ...params: unknown[]): void {
    this.tee('ERROR', message, params);
    super.error(message as never, ...(params as never[]));
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.tee('WARN', message, params);
    super.warn(message as never, ...(params as never[]));
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.tee('DEBUG', message, params);
    super.debug(message as never, ...(params as never[]));
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.tee('VERBOSE', message, params);
    super.verbose(message as never, ...(params as never[]));
  }
}

async function bootstrap(): Promise<void> {
  loadEnv(join(__dirname, '..', '.env'));
  const port = Number(process.env.PORT ?? 3001);

  const logDir = join(__dirname, '..', 'logs');
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {
    /* dossier déjà présent ou non créable : on ignore */
  }
  const logStream = createWriteStream(join(logDir, 'access.log'), { flags: 'a' });

  const app = await NestFactory.create(AppModule, { logger: new FileTeeLogger(logStream) });
  app.enableCors();
  // Le catalogue complet fait plusieurs Mo de texte TLE : gzip le réduit d'environ 80 %.
  app.use(compression());
  // Pas d'ETag : les 304 conditionnels perturbent le fetch du client.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.getHttpAdapter().getInstance().set('etag', false);

  const http = new Logger('HTTP');
  app.use((req: unknown, res: unknown, next: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = res as any;
    const startedAt = Date.now();
    s.on('finish', () => {
      http.log(`${r.method} ${r.originalUrl} → ${s.statusCode} (${Date.now() - startedAt} ms)`);
    });
    next();
  });

  await app.listen(port);

  const config = new Logger('Config');
  const groups = configuredGroups();
  config.log(`✅ Serveur NestJS démarré : http://localhost:${port}/api/satellites`);
  config.log(`source : Celestrak · groupes : ${groups.map((g) => g.id).join(', ')}`);
  const localFiles = localTleFiles();
  config.log(
    localFiles.length > 0
      ? `fichiers TLE locaux : ${localFiles.length} détecté(s) dans ${tleDir()} — fusionnés avec Celestrak`
      : `fichiers TLE locaux : aucun (déposer un .tle dans ${tleDir()} pour travailler hors ligne)`,
  );
  config.log(`cache : ${catalogTtlMs() / 60_000} min · TLE écartés au-delà de ${maxEpochAgeDays()} jours`);
  config.log('propagation SGP4 : côté client (WebWorker) — aucun calcul de position côté serveur');

  // Préchargement : le catalogue est prêt avant la première requête du navigateur.
  const catalog = app.get(SatelliteCatalogService);
  void catalog
    .getSnapshot()
    .then((s) => config.log(`préchargement terminé : ${s.count} objets en orbite`))
    .catch((err: unknown) =>
      config.warn(
        `préchargement impossible (hors ligne ?) : ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
}

void bootstrap();
