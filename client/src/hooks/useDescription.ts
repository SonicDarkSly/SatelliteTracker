/**
 * Notice encyclopédique du satellite sélectionné, chargée à la demande.
 *
 * Le rôle de la famille est déjà présent dans l'instantané (aucun appel réseau) ;
 * seule la notice détaillée est récupérée ici, quand l'utilisateur sélectionne un
 * objet. Les réponses déjà obtenues sont conservées pour la durée de la session,
 * en plus du cache serveur.
 */
import { useEffect, useState } from 'react';
import type { SatelliteDescription } from '../types';

const sessionCache = new Map<string, SatelliteDescription>();

export function useDescription(noradId: string | undefined): {
  description: SatelliteDescription | undefined;
  loading: boolean;
} {
  const [description, setDescription] = useState<SatelliteDescription | undefined>(() =>
    noradId ? sessionCache.get(noradId) : undefined,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!noradId) {
      setDescription(undefined);
      return;
    }

    const cached = sessionCache.get(noradId);
    if (cached) {
      setDescription(cached);
      return;
    }

    // Sélection rapide successive (flèches, survols) : on abandonne la requête
    // précédente plutôt que d'afficher une notice qui ne correspond plus.
    const controller = new AbortController();
    setDescription(undefined);
    setLoading(true);

    fetch(`/api/satellites/${noradId}/description`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SatelliteDescription>) : undefined))
      .then((data) => {
        if (!data) return;
        sessionCache.set(noradId, data);
        setDescription(data);
      })
      .catch(() => {
        /* requête abandonnée ou serveur injoignable : le rôle de famille suffit */
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [noradId]);

  return { description, loading };
}
