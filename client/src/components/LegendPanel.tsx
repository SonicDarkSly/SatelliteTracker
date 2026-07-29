/**
 * Légende du globe : ce que signifient les couleurs et les formes.
 *
 * Les deux dimensions sont indépendantes et c'est le point à faire comprendre :
 * la **couleur** vient de la catégorie de l'objet (à quoi il sert), la **forme**
 * de sa famille (à quoi il ressemble). Un Starlink et un OneWeb ont la même
 * silhouette mais pas la même couleur ; un télescope et un satellite météo ont
 * des silhouettes différentes.
 *
 * Seules les catégories réellement présentes dans le catalogue sont listées, avec
 * leur effectif : une légende qui annonce des couleurs absentes de l'écran est
 * plus déroutante qu'utile.
 */
import { CloseOutlined } from '@ant-design/icons';
import { Button, Divider, Typography } from 'antd';
import { CATEGORY_COLORS } from '../constants';
import { SATELLITE_ICONS, SHAPE_LABELS } from './satelliteIcon';
import type { IconShape } from './satelliteIcon';
import type { FacetCount } from '../types';

const { Text } = Typography;
const nf = new Intl.NumberFormat('fr-FR');

/** Ordre d'affichage des silhouettes : du plus notable au plus anecdotique. */
const SHAPE_ORDER: IconShape[] = [
  'iss',
  'station',
  'capsule',
  'flat',
  'nav',
  'dish',
  'observer',
  'telescope',
  'cube',
  'booster',
  'debris',
  'sphere',
  'default',
];

interface Props {
  /** Catégories présentes, telles que comptées par le serveur. */
  categories: FacetCount[];
  /** Silhouettes affichées ou non selon le réglage des marqueurs. */
  showShapes: boolean;
  onClose: () => void;
}

export function LegendPanel({ categories, showShapes, onClose }: Props): JSX.Element {
  return (
    <div className="panel legend-panel">
      <div className="panel-header">
        <Text strong>Légende</Text>
        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <Divider orientation="left" plain>
        Couleur : usage
      </Divider>
      <div className="legend-list">
        {categories.map((c) => (
          <div key={c.id} className="legend-row">
            <span
              className="filter-dot"
              style={{ background: CATEGORY_COLORS[c.id] ?? CATEGORY_COLORS.other }}
            />
            <span className="legend-label">{c.label}</span>
            <Text type="secondary">{nf.format(c.count)}</Text>
          </div>
        ))}
      </div>

      {showShapes && (
        <>
          <Divider orientation="left" plain>
            Forme : type d’objet
          </Divider>
          <div className="legend-list">
            {SHAPE_ORDER.map((shape) => (
              <div key={shape} className="legend-row">
                <img className="legend-icon" src={SATELLITE_ICONS[shape]} alt="" />
                <span className="legend-label">{SHAPE_LABELS[shape]}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Divider plain />
      <Text type="secondary" className="legend-note">
        {showShapes
          ? 'La couleur indique l’usage de l’objet, la forme sa nature : les deux sont indépendantes.'
          : 'Activez « Icônes de satellite » dans les réglages pour distinguer aussi les types par leur forme.'}
      </Text>
    </div>
  );
}
