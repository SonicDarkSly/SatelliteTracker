/**
 * INTERFACE — API HTTP.
 *   GET  /api/health                  sonde de démarrage (utilisée par le lanceur)
 *   GET  /api/satellites              catalogue complet (TLE) — read model
 *   GET  /api/satellites/facets       facettes et fraîcheur, sans les TLE
 *   GET  /api/satellites/:noradId     fiche d'un objet
 *   GET  /api/satellites/:id/description  rôle + notice encyclopédique
 *   POST /api/satellites/refresh      force le rechargement depuis les sources
 */
import { Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { CatalogSnapshot, SatelliteRecord } from '../../domain/model/types.js';
import { GetCatalogQuery } from '../../application/queries/GetCatalogQuery.js';
import type { CatalogFacets } from '../../application/queries/GetFacetsQuery.js';
import { GetFacetsQuery } from '../../application/queries/GetFacetsQuery.js';
import { GetSatelliteQuery } from '../../application/queries/GetSatelliteQuery.js';
import type { SatelliteDescription } from '../../application/queries/GetDescriptionQuery.js';
import { GetDescriptionQuery } from '../../application/queries/GetDescriptionQuery.js';
import { RefreshCatalogCommand } from '../../application/commands/RefreshCatalogCommand.js';

/**
 * Directive de cache déduite de l'instantané servi.
 *
 * Le catalogue complet se prête au cache navigateur : plusieurs mégaoctets,
 * régénérés toutes les deux heures. Une réponse provisoire ou en échec, non.
 * Le navigateur la rejoue alors sans consulter le serveur : la page reste
 * bloquée sur une erreur périmée, un rechargement n'y change rien, et les
 * relances du client ne sortent même plus du navigateur — donc rien n'apparaît
 * dans le journal serveur, ce qui rend la panne indéchiffrable. Constaté en
 * vrai : catalogue prêt à 11:38:15, écran encore en erreur à 11:41, zéro
 * requête reçue entre les deux.
 */
function cacheDirective(snapshot: CatalogSnapshot): string {
  const exploitable =
    !snapshot.fetching && snapshot.count > 0 && snapshot.sources.every((source) => source.ok);
  return exploitable ? 'public, max-age=600' : 'no-store';
}

@Controller('api')
export class SatellitesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get('health')
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'satellite-tracker' };
  }

  /**
   * Catalogue complet. Réponse volumineuse (plusieurs Mo) mais très compressible :
   * la compression gzip est activée dans main.ts.
   */
  @Get('satellites')
  async getCatalog(@Res({ passthrough: true }) res: Response): Promise<CatalogSnapshot> {
    const snapshot = await this.queries.execute<GetCatalogQuery, CatalogSnapshot>(
      new GetCatalogQuery(),
    );
    res.setHeader('Cache-Control', cacheDirective(snapshot));
    return snapshot;
  }

  @Get('satellites/facets')
  getFacets(): Promise<CatalogFacets> {
    return this.queries.execute(new GetFacetsQuery());
  }

  @Post('satellites/refresh')
  refresh(): Promise<CatalogSnapshot> {
    return this.commands.execute(new RefreshCatalogCommand());
  }

  /**
   * Rôle de l'objet et, si un article correspond, notice encyclopédique.
   * Déclarée avant la route générique `:noradId` pour ne pas être absorbée par elle.
   */
  @Get('satellites/:noradId/description')
  getDescription(@Param('noradId') noradId: string): Promise<SatelliteDescription> {
    return this.queries.execute(new GetDescriptionQuery(noradId));
  }

  @Get('satellites/:noradId')
  getOne(@Param('noradId') noradId: string): Promise<SatelliteRecord> {
    return this.queries.execute(new GetSatelliteQuery(noradId));
  }
}
