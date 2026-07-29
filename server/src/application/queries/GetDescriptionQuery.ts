/**
 * QUERY — description d'un objet : rôle de sa famille (immédiat, hors ligne) et,
 * quand l'article existe, notice encyclopédique (réseau, mise en cache).
 */
import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ENCYCLOPEDIA_PORT } from '../../app.tokens.js';
import type { EncyclopediaPort } from '../../domain/ports/EncyclopediaPort.js';
import type { SatelliteFamily } from '../../domain/model/families.js';
import { FAMILIES } from '../../domain/model/families.js';
import { SatelliteCatalogService } from '../SatelliteCatalogService.js';

export interface SatelliteDescription {
  readonly noradId: string;
  readonly name: string;
  /** Famille rattachée, avec son rôle rédigé. Absente si l'objet n'a pu être rattaché. */
  readonly family?: SatelliteFamily;
  /** Notice Wikipédia, si un article correspond à la famille. */
  readonly notice?: {
    readonly title: string;
    readonly extract: string;
    readonly url: string;
    readonly attribution: string;
  };
}

export class GetDescriptionQuery {
  constructor(readonly noradId: string) {}
}

@QueryHandler(GetDescriptionQuery)
export class GetDescriptionQueryHandler
  implements IQueryHandler<GetDescriptionQuery, SatelliteDescription>
{
  constructor(
    private readonly catalog: SatelliteCatalogService,
    @Inject(ENCYCLOPEDIA_PORT) private readonly encyclopedia: EncyclopediaPort,
  ) {}

  async execute({ noradId }: GetDescriptionQuery): Promise<SatelliteDescription> {
    const satellite = await this.catalog.findByNoradId(noradId);
    if (!satellite) throw new NotFoundException(`Aucun objet au catalogue NORAD ${noradId}`);

    const family = satellite.family ? FAMILIES[satellite.family] : undefined;
    const notice = family?.wikipedia
      ? await this.encyclopedia.lookup(family.wikipedia)
      : undefined;

    return { noradId: satellite.noradId, name: satellite.name, family, notice };
  }
}
