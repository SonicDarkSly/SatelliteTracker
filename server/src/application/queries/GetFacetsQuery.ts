/**
 * QUERY — métadonnées du catalogue sans les TLE : facettes de filtrage,
 * fraîcheur, état des sources. Réponse légère, utilisée au démarrage du client
 * pour afficher l'UI avant le téléchargement du catalogue complet.
 */
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { CatalogSnapshot } from '../../domain/model/types.js';
import { SatelliteCatalogService } from '../SatelliteCatalogService.js';

export type CatalogFacets = Omit<CatalogSnapshot, 'satellites'>;

export class GetFacetsQuery {}

@QueryHandler(GetFacetsQuery)
export class GetFacetsQueryHandler implements IQueryHandler<GetFacetsQuery, CatalogFacets> {
  constructor(private readonly catalog: SatelliteCatalogService) {}

  async execute(): Promise<CatalogFacets> {
    const { satellites: _satellites, ...facets } = await this.catalog.getSnapshot(false);
    return facets;
  }
}
