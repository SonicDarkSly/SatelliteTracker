/** Barre d'état : fraîcheur des données, sources, volumétrie. */
import { Badge, Popover, Space, Tooltip, Typography } from 'antd';
import { formatDateTime } from '../utils/format';
import type { CatalogSnapshot } from '../types';

const { Text } = Typography;
const nf = new Intl.NumberFormat('fr-FR');

interface Props {
  snapshot: CatalogSnapshot | undefined;
  origin: string | undefined;
  propagableCount: number;
  visibleCount: number;
}

export function StatusBar({
  snapshot,
  origin,
  propagableCount,
  visibleCount,
}: Props): JSX.Element | null {
  if (!snapshot) return null;

  const failed = snapshot.sources.filter((s) => !s.ok);

  const sourceDetail = (
    <div className="source-detail">
      {snapshot.sources.map((s) => (
        <div key={s.id}>
          <Badge status={s.ok ? 'success' : 'error'} />
          <Text>{s.label}</Text>{' '}
          <Text type="secondary">
            {s.ok ? `${nf.format(s.count)} objets` : (s.error ?? 'erreur')}
          </Text>
        </div>
      ))}
    </div>
  );

  return (
    <footer className="statusbar">
      <Space size={16} wrap>
        <Text type="secondary">
          {nf.format(visibleCount)} affichés · {nf.format(propagableCount)} propageables ·{' '}
          {nf.format(snapshot.count)} au catalogue
        </Text>

        <Popover content={sourceDetail} title="Sources d'éléments orbitaux">
          <Space size={4} className="clickable">
            <Badge status={failed.length === 0 ? 'success' : 'warning'} />
            <Text type="secondary">
              {failed.length === 0
                ? `${snapshot.sources.length} sources OK`
                : `${failed.length} source(s) en échec`}
            </Text>
          </Space>
        </Popover>

        <Tooltip title="Date de récupération des éléments orbitaux">
          <Text type="secondary">
            TLE du {formatDateTime(snapshot.fetchedAt)}
            {snapshot.stale ? ' (périmés)' : ''}
            {origin ? ` · ${origin}` : ''}
          </Text>
        </Tooltip>

        <Text type="secondary" className="credits">
          Éléments orbitaux : Celestrak / 18ᵉ SDS · propagation SGP4 dans le navigateur
        </Text>
      </Space>
    </footer>
  );
}
