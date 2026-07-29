/** Panneau de réglages d'affichage (drawer). */
import { Alert, Button, Divider, Select, Slider, Switch, Typography } from 'antd';
import { BASE_MAPS, ORBIT_BATCH_MAX } from '../constants';
import { DEFAULT_SETTINGS } from '../hooks/useSettings';
import type { DisplaySettings } from '../hooks/useSettings';
import type { BaseMapKind } from './GlobeView';

const { Text } = Typography;
const nf = new Intl.NumberFormat('fr-FR');

interface Props {
  settings: DisplaySettings;
  onChange: (next: DisplaySettings) => void;
  /** Nombre d'objets passant les filtres, pour signaler le plafond d'orbites. */
  visibleCount: number;
}

/** Ligne « libellé + interrupteur ». */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <Text>{label}</Text>
        {hint && (
          <Text type="secondary" className="setting-hint">
            {hint}
          </Text>
        )}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

export function SettingsPanel({ settings, onChange, visibleCount }: Props): JSX.Element {
  const set = <K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]): void =>
    onChange({ ...settings, [key]: value });

  const orbitsCapped = settings.showOrbits && visibleCount > ORBIT_BATCH_MAX;

  return (
    <div className="settings">
      <Divider orientation="left" plain>
        Affichage
      </Divider>

      <Toggle
        label="Orbites"
        hint={`Ellipse orbitale des objets affichés, jusqu'à ${ORBIT_BATCH_MAX}`}
        checked={settings.showOrbits}
        onChange={(v) => set('showOrbits', v)}
      />

      {orbitsCapped && (
        <Alert
          type="info"
          showIcon
          className="setting-alert"
          message={`${nf.format(visibleCount)} objets affichés : seule l'orbite du satellite sélectionné est tracée.`}
          description={`Affinez les filtres sous ${ORBIT_BATCH_MAX} objets pour voir toutes les orbites — au-delà, le globe devient illisible.`}
        />
      )}

      <Toggle
        label="Étiquette du satellite suivi"
        hint="Nom affiché sur le globe à côté du point sélectionné"
        checked={settings.showLabel}
        onChange={(v) => set('showLabel', v)}
      />

      <Toggle
        label="Info-bulle au survol"
        hint="Nom, pays, altitude et vitesse au passage du curseur"
        checked={settings.hoverTooltip}
        onChange={(v) => set('hoverTooltip', v)}
      />

      <Divider orientation="left" plain>
        Taille des points
      </Divider>

      <Text type="secondary">Taille de base : {settings.pointSize} px</Text>
      <Slider
        min={1}
        max={12}
        step={0.5}
        value={settings.pointSize}
        onChange={(v) => set('pointSize', v)}
      />

      <Text type="secondary">
        Grossissement en vue rapprochée : × {settings.zoomBoost.toFixed(1)}
      </Text>
      <Slider
        min={1}
        max={14}
        step={0.5}
        value={settings.zoomBoost}
        onChange={(v) => set('zoomBoost', v)}
        tooltip={{ formatter: (v) => `× ${v}` }}
      />
      <Text type="secondary">
        Point sélectionné : × {settings.selectedScale.toFixed(1)} (
        {(settings.pointSize * settings.selectedScale).toFixed(1)} px)
      </Text>
      <Slider
        min={1}
        max={4}
        step={0.1}
        value={settings.selectedScale}
        onChange={(v) => set('selectedScale', v)}
        tooltip={{ formatter: (v) => `× ${v}` }}
      />

      <Text type="secondary" className="setting-hint">
        Les points grossissent quand la caméra s'approche et se réduisent au loin. Augmentez
        ces valeurs si les objets sont difficiles à viser, réduisez-les si le point
        sélectionné masque son environnement.
      </Text>

      <Divider orientation="left" plain>
        Globe
      </Divider>

      <div className="setting-row">
        <div className="setting-text">
          <Text>Fond de carte</Text>
          <Text type="secondary" className="setting-hint">
            « Relief » fonctionne hors ligne mais reste flou en zoom rapproché
          </Text>
        </div>
        <Select
          value={settings.baseMap}
          onChange={(v: BaseMapKind) => set('baseMap', v)}
          className="basemap-select"
          options={BASE_MAPS.map((b) => ({ value: b.value, label: b.label }))}
        />
      </div>

      <Toggle
        label="Éclairage jour / nuit"
        hint="Position réelle du Soleil à l'instant simulé"
        checked={settings.lighting}
        onChange={(v) => set('lighting', v)}
      />

      <Toggle
        label="Atmosphère"
        hint="Halo atmosphérique et diffusion au ras du sol"
        checked={settings.atmosphere}
        onChange={(v) => set('atmosphere', v)}
      />

      <Toggle
        label="Lune"
        hint="Position, taille (1 737 km de rayon) et distance réelles — reculez la caméra pour la voir"
        checked={settings.moon}
        onChange={(v) => set('moon', v)}
      />

      <Toggle
        label="Trajectoire lunaire"
        hint="Orbite sur un mois sidéral (27,32 j), distance et vitesse instantanées (≈ 1,02 km/s)"
        checked={settings.moonOrbit}
        onChange={(v) => set('moonOrbit', v)}
      />

      <Divider plain />
      <Button block onClick={() => onChange(DEFAULT_SETTINGS)}>
        Réglages par défaut
      </Button>
    </div>
  );
}
