/** Barre d'état : provenance des données, fraîcheur, sources, volumétrie. */
import { forwardRef } from 'react';
import { Badge, Divider, Popover, Space, Tooltip, Typography } from 'antd';
import { formatDateTime } from '../utils/format';
import type { BaseMapKind } from './GlobeView';
import type { CatalogSnapshot } from '../types';

const { Link, Text } = Typography;
const nf = new Intl.NumberFormat('fr-FR');

/** Attribution du fond de carte, imposée par chaque fournisseur. */
const BASEMAP_CREDITS: Record<BaseMapKind, string> = {
  satellite: 'Esri World Imagery (Maxar, Earthstar Geographics)',
  plan: 'OpenStreetMap contributors',
  relief: 'Natural Earth II (hors ligne)',
};

interface Props {
  snapshot: CatalogSnapshot | undefined;
  propagableCount: number;
  visibleCount: number;
  baseMap: BaseMapKind;
  /** Réglages demandés mais suspendus faute de lisibilité, avec leur plafond. */
  suppressed: { label: string; limit: number }[];
}

/**
 * Le conteneur de crédits Cesium est monté ici (et transmis au Viewer via une
 * ref) : c'est ce qui permet de retirer le logo du globe tout en conservant les
 * attributions, regroupées avec les autres sources de données.
 */
export const StatusBar = forwardRef<HTMLDivElement, Props>(function StatusBar(
  { snapshot, propagableCount, visibleCount, baseMap, suppressed },
  creditRef,
) {
  const failed = snapshot?.sources.filter((s) => !s.ok) ?? [];

  const sourceDetail = (
    <div className="source-detail">
      {snapshot?.sources.map((s) => (
        <div key={s.id}>
          <Badge status={s.ok ? 'success' : 'error'} />
          <Text>{s.label}</Text>{' '}
          <Text type="secondary">
            {s.ok ? `${nf.format(s.count)} objets` : (s.error ?? 'erreur')}
          </Text>
        </div>
      ))}
      <Divider style={{ margin: '8px 0' }} />
      <div>
        <Text type="secondary">
          Éléments orbitaux publics du catalogue NORAD, publiés par le 18ᵉ Space Defense
          Squadron et redistribués par Celestrak. Rafraîchis toutes les 2 heures.
        </Text>
      </div>
    </div>
  );

  return (
    <footer className="statusbar">
      <div className="statusbar-row">
        {snapshot && (
          <>
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
              </Text>
            </Tooltip>
          </>
        )}

        {/*
          Réglages activés mais sans effet visible à cette échelle. Sans cette
          mention, l'utilisateur active « orbites » ou « icônes » et ne voit rien
          changer, l'explication étant enfouie dans le panneau de réglages.
        */}
        {suppressed.length > 0 && (
          <Tooltip
            title={suppressed
              .map(
                (s) =>
                  `${s.label} : au-delà de ${nf.format(s.limit)} objets affichés, l’affichage devient illisible. Affinez les filtres.`,
              )
              .join(' ')}
          >
            <Space size={4} className="clickable">
              <Badge status="default" />
              <Text type="secondary">
                {suppressed.map((s) => s.label).join(' et ')} en attente (
                {nf.format(visibleCount)} objets affichés)
              </Text>
            </Space>
          </Tooltip>
        )}

        <Text type="secondary" className="statusbar-sources">
          Données orbitales :{' '}
          <Link href="https://celestrak.org" target="_blank" rel="noreferrer">
            Celestrak
          </Link>{' '}
          / 18ᵉ SDS · Fond de carte : {BASEMAP_CREDITS[baseMap]} · Rendu : CesiumJS ·
          Propagation SGP4 (satellite.js) dans le navigateur
        </Text>

        {/* Attributions injectées par Cesium (fournisseur d'imagerie, licences). */}
        <div ref={creditRef} className="cesium-credit-host" />
      </div>
    </footer>
  );
});
