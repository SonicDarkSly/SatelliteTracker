/** Panneau de filtrage : catégories, régimes orbitaux, altitude. */
import { Button, Checkbox, Divider, Select, Slider, Space, Tag, Typography } from 'antd';
import { CATEGORY_COLORS } from '../constants';
import { DEFAULT_FILTERS } from '../hooks/useSatelliteFilters';
import type { FilterState } from '../hooks/useSatelliteFilters';
import type { FacetCount } from '../types';

const { Text } = Typography;

interface Props {
  categories: FacetCount[];
  regimes: FacetCount[];
  owners: FacetCount[];
  filters: FilterState;
  onChange: (next: FilterState) => void;
  visibleCount: number;
  totalCount: number;
}

const nf = new Intl.NumberFormat('fr-FR');

export function FiltersPanel({
  categories,
  regimes,
  owners,
  filters,
  onChange,
  visibleCount,
  totalCount,
}: Props): JSX.Element {
  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="panel">
      <div className="panel-header">
        <Text strong>Filtres</Text>
        <Text type="secondary" className="panel-count">
          {nf.format(visibleCount)} / {nf.format(totalCount)} affichés
        </Text>
      </div>

      <Divider orientation="left" plain>
        Catégories
      </Divider>
      <Space direction="vertical" size={4} className="filter-list">
        {categories.map((c) => (
          <Checkbox
            key={c.id}
            checked={!filters.hiddenCategories.includes(c.id)}
            onChange={() =>
              onChange({
                ...filters,
                hiddenCategories: toggle(filters.hiddenCategories, c.id),
              })
            }
          >
            <span className="filter-row">
              <span
                className="filter-dot"
                style={{ background: CATEGORY_COLORS[c.id] ?? CATEGORY_COLORS.other }}
              />
              <span className="filter-label">{c.label}</span>
              <Tag bordered={false}>{nf.format(c.count)}</Tag>
            </span>
          </Checkbox>
        ))}
      </Space>

      <Divider orientation="left" plain>
        Régime orbital
      </Divider>
      <Space direction="vertical" size={4} className="filter-list">
        {regimes.map((r) => (
          <Checkbox
            key={r.id}
            checked={!filters.hiddenRegimes.includes(r.id)}
            onChange={() =>
              onChange({ ...filters, hiddenRegimes: toggle(filters.hiddenRegimes, r.id) })
            }
          >
            <span className="filter-row">
              <span className="filter-label">{r.label}</span>
              <Tag bordered={false}>{nf.format(r.count)}</Tag>
            </span>
          </Checkbox>
        ))}
      </Space>

      <Divider orientation="left" plain>
        Pays / organisme
      </Divider>
      <Select
        mode="multiple"
        allowClear
        className="owner-select"
        placeholder="Tous (États, agences, opérateurs)"
        value={filters.owners}
        onChange={(owners: string[]) => onChange({ ...filters, owners })}
        maxTagCount="responsive"
        optionFilterProp="label"
        options={owners.map((o) => ({
          value: o.id,
          label: `${o.label} (${nf.format(o.count)})`,
        }))}
      />
      <Text type="secondary" className="filter-hint">
        Propriétaire déclaré au registre SATCAT : État, agence spatiale (ESA, EUMETSAT) ou
        opérateur (Intelsat, SES…). Aucune sélection = tous.
      </Text>

      <Divider orientation="left" plain>
        Altitude maximale
      </Divider>
      <Slider
        min={0}
        max={40_000}
        step={500}
        value={filters.maxAltitudeKm}
        tooltip={{
          formatter: (v) => (v === 0 ? 'Sans limite' : `${nf.format(v ?? 0)} km`),
        }}
        onChange={(v) => onChange({ ...filters, maxAltitudeKm: v })}
      />
      <Text type="secondary">
        {filters.maxAltitudeKm === 0
          ? 'Toutes les altitudes'
          : `Jusqu'à ${nf.format(filters.maxAltitudeKm)} km`}
      </Text>

      <Divider plain />
      <Button block onClick={() => onChange({ ...DEFAULT_FILTERS, search: filters.search })}>
        Réinitialiser les filtres
      </Button>
    </div>
  );
}
