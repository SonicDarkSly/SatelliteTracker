/**
 * Module racine — câblage des ports du domaine vers leurs adapters
 * d'infrastructure, enregistrement des handlers CQRS et du contrôleur.
 */
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CATALOG_CACHE_PORT, TLE_SOURCES } from './app.tokens.js';
import { CelestrakSource } from './infrastructure/sources/CelestrakSource.js';
import { MemoryCatalogCache } from './infrastructure/cache/MemoryCatalogCache.js';
import { configuredGroups } from './infrastructure/config/celestrak.js';
import { SatelliteCatalogService } from './application/SatelliteCatalogService.js';
import { GetCatalogQueryHandler } from './application/queries/GetCatalogQuery.js';
import { GetFacetsQueryHandler } from './application/queries/GetFacetsQuery.js';
import { GetSatelliteQueryHandler } from './application/queries/GetSatelliteQuery.js';
import { RefreshCatalogCommandHandler } from './application/commands/RefreshCatalogCommand.js';
import { SatellitesController } from './interface/http/satellites.controller.js';

@Module({
  imports: [CqrsModule],
  controllers: [SatellitesController],
  providers: [
    {
      provide: TLE_SOURCES,
      useFactory: () => configuredGroups().map((g) => new CelestrakSource(g.id, g.label)),
    },
    { provide: CATALOG_CACHE_PORT, useClass: MemoryCatalogCache },
    SatelliteCatalogService,
    GetCatalogQueryHandler,
    GetFacetsQueryHandler,
    GetSatelliteQueryHandler,
    RefreshCatalogCommandHandler,
  ],
})
export class AppModule {}
