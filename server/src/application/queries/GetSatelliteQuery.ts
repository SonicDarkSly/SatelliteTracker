/** QUERY — fiche d'un objet en orbite par son n° NORAD. */
import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { SatelliteRecord } from '../../domain/model/types.js';
import { SatelliteCatalogService } from '../SatelliteCatalogService.js';

export class GetSatelliteQuery {
  constructor(readonly noradId: string) {}
}

@QueryHandler(GetSatelliteQuery)
export class GetSatelliteQueryHandler
  implements IQueryHandler<GetSatelliteQuery, SatelliteRecord>
{
  constructor(private readonly catalog: SatelliteCatalogService) {}

  async execute({ noradId }: GetSatelliteQuery): Promise<SatelliteRecord> {
    const found = await this.catalog.findByNoradId(noradId);
    if (!found) throw new NotFoundException(`Aucun objet au catalogue NORAD ${noradId}`);
    return found;
  }
}
