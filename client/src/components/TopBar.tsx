/** Barre supérieure : recherche, contrôle du temps, rafraîchissement. */
import { ClockCircleOutlined, FilterOutlined, ReloadOutlined } from '@ant-design/icons';
import { AutoComplete, Button, Select, Space, Switch, Tooltip, Typography } from 'antd';
import { BASE_MAPS, TIME_RATES } from '../constants';
import type { BaseMapKind } from './GlobeView';
import type { SatelliteRecord } from '../types';

const { Text } = Typography;

interface Props {
  search: string;
  onSearch: (value: string) => void;
  matches: { index: number; satellite: SatelliteRecord }[];
  onPick: (index: number) => void;
  rate: number;
  onRate: (rate: number) => void;
  simEpochMs: number;
  onSeek: (offsetMinutes: number) => void;
  lighting: boolean;
  onLighting: (value: boolean) => void;
  baseMap: BaseMapKind;
  onBaseMap: (value: BaseMapKind) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onToggleFilters: () => void;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TopBar({
  search,
  onSearch,
  matches,
  onPick,
  rate,
  onRate,
  simEpochMs,
  onSeek,
  lighting,
  onLighting,
  baseMap,
  onBaseMap,
  refreshing,
  onRefresh,
  onToggleFilters,
}: Props): JSX.Element {
  return (
    <header className="topbar">
      <Space size={8} className="topbar-left">
        <Button icon={<FilterOutlined />} onClick={onToggleFilters} className="filters-toggle">
          Filtres
        </Button>
        <Text strong className="brand">
          SatelliteTracker
        </Text>
      </Space>

      <AutoComplete
        className="search"
        value={search}
        onChange={onSearch}
        onSelect={(value: string) => onPick(Number(value))}
        options={matches.map((m) => ({
          value: String(m.index),
          label: (
            <span className="search-option">
              <span>{m.satellite.name}</span>
              <Text type="secondary">
                {m.satellite.regime} · {m.satellite.noradId}
              </Text>
            </span>
          ),
        }))}
        placeholder="Rechercher un satellite ou un n° NORAD (ISS, Starlink, 25544…)"
        allowClear
      />

      <Space size={8} className="topbar-right">
        <Tooltip title="Instant simulé">
          <Space size={4}>
            <ClockCircleOutlined />
            <Text className="clock">{formatClock(simEpochMs)}</Text>
          </Space>
        </Tooltip>

        <Select
          value={rate}
          onChange={onRate}
          className="rate-select"
          options={TIME_RATES.map((r) => ({ value: r.value, label: r.label }))}
        />

        <Tooltip title="Revenir à l'instant présent">
          <Button onClick={() => onSeek(0)}>Maintenant</Button>
        </Tooltip>

        <Tooltip title="Fond de carte">
          <Select
            value={baseMap}
            onChange={onBaseMap}
            className="basemap-select"
            options={BASE_MAPS.map((b) => ({ value: b.value, label: b.label }))}
          />
        </Tooltip>

        <Tooltip title="Éclairage jour / nuit">
          <Switch checked={lighting} onChange={onLighting} checkedChildren="☀" unCheckedChildren="☾" />
        </Tooltip>

        <Tooltip title="Recharger les éléments orbitaux depuis la source">
          <Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefresh} />
        </Tooltip>
      </Space>
    </header>
  );
}
