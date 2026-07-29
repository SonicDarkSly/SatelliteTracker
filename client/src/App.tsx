/**
 * Composition de l'application.
 *
 * Découpage des responsabilités :
 *   useCatalog          récupération des TLE (réseau + copie localStorage)
 *   usePropagation      pilotage du worker SGP4, horloge simulée
 *   useSatelliteFilters masque de visibilité (aucune reconstruction de scène)
 *   GlobeView           rendu Cesium, lecture directe des tampons de positions
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ConfigProvider, Drawer, Spin, theme } from 'antd';
import frFR from 'antd/locale/fr_FR';
import { GlobeView } from './components/GlobeView';
import { FiltersPanel } from './components/FiltersPanel';
import { SatelliteDetails } from './components/SatelliteDetails';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import { useCatalog } from './hooks/useCatalog';
import { useLocalStorage } from './hooks/useLocalStorage';
import { usePropagation } from './hooks/usePropagation';
import { useSatelliteFilters } from './hooks/useSatelliteFilters';
import { STORAGE_KEYS } from './constants';

export default function App(): JSX.Element {
  const { snapshot, loading, refreshing, error, origin, refresh } = useCatalog();
  const satellites = snapshot?.satellites;

  const propagation = usePropagation(satellites);
  const { filters, setFilters, visible, visibleCount, matches } = useSatelliteFilters(satellites);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lighting, setLighting] = useLocalStorage<boolean>('sattracker.lighting.v1', true);
  const [favorites, setFavorites] = useLocalStorage<string[]>(STORAGE_KEYS.favorites, []);

  // Horloge affichée : rafraîchie une fois par seconde (indépendante du rendu 60 Hz).
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClockMs(propagation.simNow()), 500);
    return () => window.clearInterval(id);
  }, [propagation]);

  // Le suivi (orbite + position géodésique) suit la sélection.
  useEffect(() => {
    propagation.track(selectedIndex);
  }, [selectedIndex, propagation]);

  const selected = useMemo(
    () => (selectedIndex !== null ? satellites?.[selectedIndex] : undefined),
    [satellites, selectedIndex],
  );

  const pickFromSearch = useCallback((index: number) => {
    setSelectedIndex(index);
    setFocusNonce((n) => n + 1);
  }, []);

  const toggleFavorite = useCallback(() => {
    if (!selected) return;
    setFavorites(
      favorites.includes(selected.noradId)
        ? favorites.filter((id) => id !== selected.noradId)
        : [...favorites, selected.noradId],
    );
  }, [favorites, selected, setFavorites]);

  return (
    <ConfigProvider
      locale={frFR}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: '#40a9ff', borderRadius: 6 },
      }}
    >
      <div className="app">
        <TopBar
          search={filters.search}
          onSearch={(search) => setFilters({ ...filters, search })}
          matches={matches}
          onPick={pickFromSearch}
          rate={propagation.rate}
          onRate={propagation.setRate}
          simEpochMs={clockMs}
          onSeek={propagation.seek}
          lighting={lighting}
          onLighting={setLighting}
          refreshing={refreshing}
          onRefresh={() => refresh(true)}
          onToggleFilters={() => setFiltersOpen(true)}
        />

        <main className="stage">
          <GlobeView
            satellites={satellites}
            visible={visible}
            frameRef={propagation.frameRef}
            selectedIndex={selectedIndex}
            orbit={propagation.orbit}
            onSelect={setSelectedIndex}
            focusNonce={focusNonce}
            lighting={lighting}
            simNow={propagation.simNow}
          />

          {loading && (
            <div className="overlay">
              <Spin size="large" tip="Récupération des éléments orbitaux…" />
            </div>
          )}

          {!loading && satellites && !propagation.ready && (
            <div className="overlay overlay-soft">
              <Spin tip="Initialisation de la propagation SGP4…" />
            </div>
          )}

          {error && (
            <Alert
              className="floating-alert"
              type="error"
              showIcon
              closable
              message={error}
              description={
                satellites
                  ? 'Les positions restent calculées à partir de la copie locale des TLE.'
                  : "Vérifiez que le serveur est démarré (port 3001) et que l'accès à celestrak.org est possible."
              }
            />
          )}

          {selected && (
            <aside className="right-dock">
              <SatelliteDetails
                satellite={selected}
                state={
                  propagation.detail?.index === selectedIndex
                    ? propagation.detail.state
                    : undefined
                }
                favorite={favorites.includes(selected.noradId)}
                onToggleFavorite={toggleFavorite}
                onFocus={() => setFocusNonce((n) => n + 1)}
                onClose={() => setSelectedIndex(null)}
              />
            </aside>
          )}
        </main>

        <StatusBar
          snapshot={snapshot}
          origin={origin}
          propagableCount={propagation.propagableCount}
          visibleCount={visibleCount}
        />

        <Drawer
          title="Filtres d'affichage"
          placement="left"
          width={380}
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
        >
          <FiltersPanel
            categories={snapshot?.categories ?? []}
            regimes={snapshot?.regimes ?? []}
            filters={filters}
            onChange={setFilters}
            visibleCount={visibleCount}
            totalCount={snapshot?.count ?? 0}
          />
        </Drawer>
      </div>
    </ConfigProvider>
  );
}
