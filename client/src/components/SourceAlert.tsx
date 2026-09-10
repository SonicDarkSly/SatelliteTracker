/**
 * Bandeau d'indisponibilité des sources, avec décompte vivant.
 *
 * Le serveur communique l'instant de la prochaine tentative (`retryAt`) : on
 * affiche donc un décompte qui avance et on redemande le catalogue à l'échéance.
 * Sans cela, le message restait figé à l'écran — heure absolue, aucun mouvement —
 * et rien n'indiquait que quelque chose allait se produire.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Typography } from 'antd';
import type { CatalogSnapshot } from '../types';

const { Text } = Typography;

interface Props {
  snapshot: CatalogSnapshot;
  /** Relance la récupération (déclenchée automatiquement à l'échéance). */
  onRetry: () => void;
}

/** Durée restante, formatée en français. */
function remaining(untilMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((untilMs - nowMs) / 1000));
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest > 0 ? `${minutes} min ${String(rest).padStart(2, '0')} s` : `${minutes} min`;
  }
  return `${seconds} s`;
}

export function SourceAlert({ snapshot, onRetry }: Props): JSX.Element | null {
  const failed = snapshot.sources.filter((s) => !s.ok);
  if (failed.length === 0) return null;

  // Échéance la plus proche parmi les sources en échec.
  const deadlines = failed
    .map((s) => (s.retryAt ? Date.parse(s.retryAt) : Number.NaN))
    .filter((t) => Number.isFinite(t));
  const nextTry = deadlines.length > 0 ? Math.min(...deadlines) : undefined;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (nextTry === undefined) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [nextTry]);

  /**
   * Échéance déjà honorée.
   *
   * Sans cette mémoire, l'effet repartait à chaque battement du décompte : une
   * fois l'instant dépassé, `now` change toutes les secondes et relançait
   * indéfiniment. Le cache du navigateur l'a longtemps masqué — les requêtes ne
   * sortaient pas de la page — jusqu'à les voir défiler en boucle dans
   * l'inspecteur. Une relance par échéance annoncée, pas davantage ; c'est le
   * sondage sur `fetching` qui assure la suite.
   */
  const relanceFaite = useRef<number | undefined>(undefined);

  // Échéance atteinte : on relance sans attendre une action de l'utilisateur.
  useEffect(() => {
    if (nextTry === undefined || now < nextTry) return;
    if (relanceFaite.current === nextTry) return;
    relanceFaite.current = nextTry;
    onRetry();
  }, [nextTry, now, onRetry]);

  const empty = snapshot.count === 0;

  return (
    <Alert
      className="floating-alert"
      type={empty ? 'error' : 'warning'}
      showIcon
      closable={!empty}
      message={empty ? 'Aucune donnée disponible' : 'Catalogue incomplet'}
      description={
        <>
          {failed.map((s) => (
            <div key={s.id}>
              <Text strong>{s.label}</Text> — {s.error ?? 'indisponible'}
            </div>
          ))}

          {nextTry !== undefined && (
            <div className="alert-countdown">
              {now < nextTry ? (
                <>Nouvelle tentative automatique dans {remaining(nextTry, now)}.</>
              ) : (
                <>Nouvelle tentative en cours…</>
              )}
            </div>
          )}

          <div className="alert-hint">
            Celestrak limite le nombre de requêtes et refuse l’accès un moment quand la
            limite est atteinte. Pour ne pas dépendre de leur disponibilité, déposez un
            export d’éléments orbitaux (<code>.json</code> au format OMM, ou{' '}
            <code>.tle</code>) dans <code>server/data/tle/</code> : il sera fusionné au
            démarrage.
          </div>

          {nextTry !== undefined && now < nextTry && (
            <Button size="small" onClick={onRetry} className="alert-action">
              Réessayer maintenant
            </Button>
          )}
        </>
      }
    />
  );
}
