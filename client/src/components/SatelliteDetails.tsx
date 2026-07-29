/** Fiche du satellite sélectionné : éléments orbitaux et position instantanée. */
import { AimOutlined, CloseOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Space, Tag, Tooltip, Typography } from 'antd';
import { CATEGORY_COLORS } from '../constants';
import type { SatelliteRecord, SatelliteState } from '../types';
import {
  epochAgeDays,
  formatDateTime,
  formatDegrees,
  formatKm,
  formatPeriod,
  formatSpeed,
} from '../utils/format';

const { Text, Title } = Typography;

interface Props {
  satellite: SatelliteRecord;
  state: SatelliteState | undefined;
  favorite: boolean;
  onToggleFavorite: () => void;
  onFocus: () => void;
  onClose: () => void;
}

export function SatelliteDetails({
  satellite,
  state,
  favorite,
  onToggleFavorite,
  onFocus,
  onClose,
}: Props): JSX.Element {
  const age = epochAgeDays(satellite.epoch);

  return (
    <div className="panel details-panel">
      <div className="panel-header">
        <Title level={5} className="details-title">
          {satellite.name}
        </Title>
        <Space size={4}>
          <Tooltip title="Centrer la caméra">
            <Button type="text" icon={<AimOutlined />} onClick={onFocus} />
          </Tooltip>
          <Tooltip title={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
            <Button
              type="text"
              icon={favorite ? <StarFilled /> : <StarOutlined />}
              onClick={onToggleFavorite}
            />
          </Tooltip>
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        </Space>
      </div>

      <Space size={[4, 4]} wrap className="details-tags">
        {satellite.categories.map((c) => (
          <Tag key={c} color={CATEGORY_COLORS[c] ?? CATEGORY_COLORS.other}>
            {c}
          </Tag>
        ))}
        <Tag bordered={false}>{satellite.regime}</Tag>
      </Space>

      {age > 14 && (
        <Alert
          type="warning"
          showIcon
          className="details-alert"
          message={`Éléments orbitaux vieux de ${Math.round(age)} jours — la position affichée peut dériver de plusieurs kilomètres.`}
        />
      )}

      <Descriptions column={1} size="small" className="details-table">
        <Descriptions.Item label="Position">
          {state
            ? `${formatDegrees(state.latitude, 'lat')} · ${formatDegrees(state.longitude, 'lon')}`
            : 'calcul en cours…'}
        </Descriptions.Item>
        <Descriptions.Item label="Altitude">
          {state ? formatKm(state.altitudeKm) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Vitesse">
          {state ? formatSpeed(state.speedKmS) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Période orbitale">
          {formatPeriod(satellite.periodMinutes)}
        </Descriptions.Item>
        <Descriptions.Item label="Inclinaison">
          {satellite.inclinationDeg.toFixed(2)}°
        </Descriptions.Item>
        <Descriptions.Item label="Excentricité">
          {satellite.eccentricity.toFixed(6)}
        </Descriptions.Item>
        <Descriptions.Item label="N° NORAD">{satellite.noradId}</Descriptions.Item>
        <Descriptions.Item label="Désignation COSPAR">
          {satellite.intlDesignator || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Époque du TLE">
          {formatDateTime(satellite.epoch)}
        </Descriptions.Item>
      </Descriptions>

      <details className="tle-block">
        <summary>
          <Text type="secondary">Éléments orbitaux bruts (TLE)</Text>
        </summary>
        <pre>
          {satellite.name}
          {'\n'}
          {satellite.line1}
          {'\n'}
          {satellite.line2}
        </pre>
      </details>
    </div>
  );
}
