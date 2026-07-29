/**
 * QUERY — lecture du catalogue complet (read model, servi depuis le cache).
 * Le client filtre et propage lui-même : la réponse ne dépend d'aucun critère.
 */
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { CatalogSnapshot } from '../../domain/model/types.js';
import { SatelliteCatalogService } from '../SatelliteCatalogService.js';

export class GetCatalogQuery {}

@QueryHandler(GetCatalogQuery)
export class GetCatalogQueryHandler implements IQueryHandler<GetCatalogQuery, CatalogSnapshot> {
  constructor(private readonly catalog: SatelliteCatalogService) {}

  execute(): Promise<CatalogSnapshot> {
    return this.catalog.getSnapshot(false);
  }
}
