/**
 * COMMAND — force le rechargement des TLE depuis les sources, cache ignoré.
 * Déclenchée par l'utilisateur (bouton) ou par le rafraîchissement planifié.
 */
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { CatalogSnapshot } from '../../domain/model/types.js';
import { SatelliteCatalogService } from '../SatelliteCatalogService.js';

export class RefreshCatalogCommand {}

@CommandHandler(RefreshCatalogCommand)
export class RefreshCatalogCommandHandler
  implements ICommandHandler<RefreshCatalogCommand, CatalogSnapshot>
{
  constructor(private readonly catalog: SatelliteCatalogService) {}

  execute(): Promise<CatalogSnapshot> {
    return this.catalog.getSnapshot(true);
  }
}
