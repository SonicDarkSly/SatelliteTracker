/** Fiche du satellite sélectionné : éléments orbitaux et position instantanée. */
import { AimOutlined, CloseOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Skeleton, Space, Tag, Tooltip, Typography } from 'antd';
import { CATEGORY_COLORS } from '../constants';
import { useDescription } from '../hooks/useDescription';
import { OBJECT_TYPE_LABELS } from '../types';
import type { SatelliteFamily, SatelliteRecord, SatelliteState } from '../types';
import {
  epochAgeDays,
  formatDateTime,
  formatDegrees,
  formatKm,
  formatPeriod,
  formatSpeed,
} from '../utils/format';

const { Text, Title } = Typography;

const { Link } = Typography;

interface Props {
  satellite: SatelliteRecord;
  state: SatelliteState | undefined;
  /** Famille rattachée, issue de l'instantané (disponible immédiatement). */
  family: SatelliteFamily | undefined;
  favorite: boolean;
  onToggleFavorite: () => void;
  onFocus: () => void;
  onClose: () => void;
}

export function SatelliteDetails({
  satellite,
  state,
  family,
  favorite,
  onToggleFavorite,
  onFocus,
  onClose,
}: Props): JSX.Element {
  const age = epochAgeDays(satellite.epoch);
  const { description, loading } = useDescription(satellite.noradId);
  const notice = description?.notice;

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

      {satellite.ownerLabel && (
        <div className="details-owner">
          {satellite.ownerFlag && <span className="details-flag">{satellite.ownerFlag}</span>}
          <Text>{satellite.ownerLabel}</Text>
          {satellite.ownerKind && satellite.ownerKind !== 'état' && (
            <Text type="secondary"> ({satellite.ownerKind})</Text>
          )}
        </div>
      )}

      <Space size={[4, 4]} wrap className="details-tags">
        {satellite.categories.map((c) => (
          <Tag key={c} color={CATEGORY_COLORS[c] ?? CATEGORY_COLORS.other}>
            {c}
          </Tag>
        ))}
        <Tag bordered={false}>{satellite.regime}</Tag>
        {satellite.objectType && satellite.objectType !== 'UNK' && (
          <Tag bordered={false}>{OBJECT_TYPE_LABELS[satellite.objectType]}</Tag>
        )}
      </Space>

      {family && (
        <section className="details-role">
          <Text strong className="details-role-title">
            {family.label}
          </Text>
          {family.operator && (
            <Text type="secondary" className="details-role-operator">
              {family.operator}
            </Text>
          )}
          <Text className="details-role-text">{family.description}</Text>
        </section>
      )}

      {/* Notice encyclopédique : chargée à la sélection, absente pour la
          plupart des objets (débris, séries sans article dédié). */}
      {loading && !notice && <Skeleton active paragraph={{ rows: 2 }} title={false} />}
      {notice && (
        <section className="details-notice">
          <Text className="details-role-text">{notice.extract}</Text>
          <Text type="secondary" className="details-notice-source">
            <Link href={notice.url} target="_blank" rel="noreferrer">
              {notice.title}
            </Link>{' '}
            — {notice.attribution}
          </Text>
        </section>
      )}

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
        {satellite.launchDate && (
          <Descriptions.Item label="Lancement">
            {new Date(satellite.launchDate).toLocaleDateString('fr-FR')}
            {satellite.launchSite ? ` · ${satellite.launchSite}` : ''}
          </Descriptions.Item>
        )}
        {satellite.rcsMeters2 !== undefined && (
          <Descriptions.Item label="Surface radar">
            {satellite.rcsMeters2.toFixed(2)} m²
          </Descriptions.Item>
        )}
        {satellite.mergedModules && satellite.mergedModules.length > 0 && (
          <Descriptions.Item label="Modules regroupés">
            {satellite.mergedModules.map((m) => `${m.name} (${m.noradId})`).join(', ')}
          </Descriptions.Item>
        )}
      </Descriptions>

      {satellite.mergedModules && satellite.mergedModules.length > 0 && (
        <Text type="secondary" className="details-merge-note">
          Le catalogue attribue un numéro à chaque module lancé. Ces entrées désignent le
          même objet physique, assemblé en orbite : elles sont regroupées ici sous la
          désignation du module de base.
        </Text>
      )}

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
