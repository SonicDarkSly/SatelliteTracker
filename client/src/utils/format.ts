/** Formatage FR des grandeurs affichées. */
import { CATEGORY_COLORS, CATEGORY_PRIORITY } from '../constants';

const nf = (digits: number) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function formatKm(value: number): string {
  return `${nf(0).format(Math.round(value))} km`;
}

export function formatSpeed(kmPerSec: number): string {
  return `${nf(2).format(kmPerSec)} km/s · ${nf(0).format(kmPerSec * 3600)} km/h`;
}

export function formatDegrees(value: number, axis: 'lat' | 'lon'): string {
  const hemisphere = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'O';
  return `${nf(3).format(Math.abs(value))}° ${hemisphere}`;
}

export function formatPeriod(minutes: number): string {
  if (minutes < 60) return `${nf(1).format(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Ancienneté d'un TLE en jours (la précision SGP4 se dégrade avec l'âge). */
export function epochAgeDays(iso: string): number {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return Number.POSITIVE_INFINITY;
  return (Date.now() - d) / 86_400_000;
}

/** Couleur d'un objet : celle de sa catégorie la plus significative. */
export function colorForCategories(categories: string[]): string {
  for (const candidate of CATEGORY_PRIORITY) {
    if (categories.includes(candidate)) return CATEGORY_COLORS[candidate];
  }
  return CATEGORY_COLORS.other;
}
