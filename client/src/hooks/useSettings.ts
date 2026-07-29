/** Réglages d'affichage, persistés en localStorage. */
import { STORAGE_KEYS } from '../constants';
import { useLocalStorage } from './useLocalStorage';
import type { BaseMapKind } from '../components/GlobeView';

export interface DisplaySettings {
  /** Tracer les orbites des objets affichés (dans la limite du plafond). */
  showOrbits: boolean;
  /** Éclairage jour/nuit sur le globe. */
  lighting: boolean;
  /** Atmosphère et halo. */
  atmosphere: boolean;
  /** Lune à sa position, sa taille et sa distance réelles. */
  moon: boolean;
  /** Trajectoire lunaire (un mois sidéral) et vitesse orbitale instantanée. */
  moonOrbit: boolean;
  /** Nom du satellite suivi affiché sur le globe. */
  showLabel: boolean;
  /** Info-bulle au survol d'un objet. */
  hoverTooltip: boolean;
  baseMap: BaseMapKind;
  /**
   * Trois réglages de taille volontairement indépendants : ils portaient
   * auparavant sur une même valeur composée, ce qui rendait leur effet
   * imprévisible.
   */
  /** Diamètre des points, en pixels, tel qu'affiché en vue globe. */
  pointSize: number;
  /** Côté des icônes de satellite, en pixels, tel qu'affiché en vue globe. */
  iconSize: number;
  /** Grossissement en approche. Sans effet sur les objets éloignés. */
  zoomBoost: number;
  /** Facteur appliqué au seul objet sélectionné. */
  selectedScale: number;
  /** Marqueurs en forme de satellite plutôt que simples points. */
  satelliteIcons: boolean;
}

export const DEFAULT_SETTINGS: DisplaySettings = {
  showOrbits: true,
  lighting: true,
  atmosphere: true,
  moon: true,
  moonOrbit: true,
  showLabel: true,
  hoverTooltip: true,
  baseMap: 'satellite',
  pointSize: 3,
  iconSize: 14,
  zoomBoost: 2,
  selectedScale: 1.5,
  satelliteIcons: true,
};

export function useSettings(): [DisplaySettings, (next: DisplaySettings) => void] {
  const [stored, setStored] = useLocalStorage<Partial<DisplaySettings>>(
    STORAGE_KEYS.settings,
    DEFAULT_SETTINGS,
  );
  // Fusion avec les valeurs par défaut : un réglage ajouté par une future
  // version ne casse pas les préférences déjà enregistrées.
  return [{ ...DEFAULT_SETTINGS, ...stored }, setStored];
}
