/**
 * Composition de l'application.
 *
 * Découpage des responsabilités :
 *   useCatalog          récupération des TLE enrichis (pays, organisme, lancement)
 *   usePropagation      pilotage du worker SGP4, horloge simulée, orbites
 *   useSatelliteFilters masque de visibilité (aucune reconstruction de scène)
 *   useSettings         réglages d'affichage persistés
 *   GlobeView           rendu Cesium, lecture directe des tampons de positions
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ConfigProvider, Drawer, Spin, theme } from 'antd';
import frFR from 'antd/locale/fr_FR';
import { GlobeView } from './components/GlobeView';
import { FiltersPanel } from './components/FiltersPanel';
import { LegendPanel } from './components/LegendPanel';
import { SourceAlert } from './components/SourceAlert';
import { SatelliteDetails } from './components/SatelliteDetails';
import { SettingsPanel } from './components/SettingsPanel';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import { useCatalog } from './hooks/useCatalog';
import { useLocalStorage } from './hooks/useLocalStorage';
import { usePropagation } from './hooks/usePropagation';
import { useSatelliteFilters } from './hooks/useSatelliteFilters';
import { useSettings } from './hooks/useSettings';
import {
  DEFAULT_HIDDEN_CATEGORIES,
  INIT_TIMEOUT_MS,
  ORBIT_BATCH_MAX,
  STORAGE_KEYS,
} from './constants';

const nf = new Intl.NumberFormat('fr-FR');

export default function App(): JSX.Element {
  const { snapshot, loading, refreshing, error, refresh } = useCatalog();
  const satellites = snapshot?.satellites;

  const propagation = usePropagation(satellites);
  const { filters, setFilters, visible, visibleCount, visibleIndices, matches } =
    useSatelliteFilters(satellites);
  const [settings, setSettings] = useSettings();

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [moonFocusNonce, setMoonFocusNonce] = useState(0);
  const [earthFocusNonce, setEarthFocusNonce] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [favorites, setFavorites] = useLocalStorage<string[]>(STORAGE_KEYS.favorites, []);
  // Légende ouverte ou non : mémorisée, c'est une préférence d'affichage durable.
  const [legendOpen, setLegendOpen] = useLocalStorage<boolean>(STORAGE_KEYS.legend, false);

  // Conteneur d'accueil des attributions Cesium, monté dans la barre d'état :
  // le logo et les crédits quittent ainsi la surface du globe.
  const creditRef = useRef<HTMLDivElement>(null);

  /*
   * On dépend des fonctions stables du hook, jamais de l'objet `propagation`
   * complet : son identité change à chaque nouvelle orbite ou position reçue.
   * En le mettant en dépendance, chaque effet se relançait à chaque réponse du
   * worker, qui déclenchait un nouveau calcul, qui relançait l'effet… une boucle
   * qui saturait le worker et empêchait les orbites de s'afficher.
   */
  const { simNow, track, setOrbitTargets, previewOrbit } = propagation;

  // Horloge affichée : rafraîchie deux fois par seconde (indépendante du rendu 60 Hz).
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClockMs(simNow()), 500);
    return () => window.clearInterval(id);
  }, [simNow]);

  // Le suivi (orbite nette + position géodésique) suit la sélection.
  useEffect(() => {
    track(selectedIndex);
  }, [selectedIndex, track]);

  /**
   * Orbites de masse : uniquement si le réglage est actif et si le nombre
   * d'objets affichés reste sous le plafond. Au-delà, le globe serait couvert de
   * traits et le lot coûterait des dizaines de milliers de propagations.
   */
  useEffect(() => {
    const targets =
      settings.showOrbits && visibleIndices.length > 0 && visibleIndices.length <= ORBIT_BATCH_MAX
        ? visibleIndices
        : [];
    setOrbitTargets(targets);
  }, [settings.showOrbits, visibleIndices, setOrbitTargets]);

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

  /*
   * Délai de garde sur l'initialisation du moteur de propagation. Sans lui, un
   * moteur qui ne démarre pas se traduit par un voile de chargement perpétuel,
   * sans aucun message — le défaut qui a rendu l'application inutilisable
   * plusieurs jours sans qu'on puisse le diagnostiquer.
   */
  const [initTimedOut, setInitTimedOut] = useState(false);
  useEffect(() => {
    if (!satellites || satellites.length === 0 || propagation.ready) {
      setInitTimedOut(false);
      return;
    }
    const id = window.setTimeout(() => setInitTimedOut(true), INIT_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [satellites, propagation.ready]);

  /** Au moins une source en échec : l'alerte détaillée prime alors sur le voile. */
  const sourcesFailed = snapshot?.sources.some((s) => !s.ok) ?? false;

  /**
   * Réglages demandés par l'utilisateur mais suspendus à cette échelle.
   * Affichés dans la barre d'état : sans cela, on active « orbites » ou
   * « icônes » et rien ne change visiblement, sans explication.
   */
  const suppressed = useMemo(() => {
    const out: { label: string; limit: number }[] = [];
    if (settings.showOrbits && visibleCount > ORBIT_BATCH_MAX) {
      out.push({ label: 'orbites', limit: ORBIT_BATCH_MAX });
    }
    return out;
  }, [settings.showOrbits, visibleCount]);

  /** Nombre de filtres qui s'écartent des valeurs par défaut. */
  const activeFilterCount = useMemo(() => {
    let n = 0;
    const defaults = new Set(DEFAULT_HIDDEN_CATEGORIES);
    if (
      filters.hiddenCategories.length !== defaults.size ||
      filters.hiddenCategories.some((c) => !defaults.has(c))
    ) {
      n++;
    }
    if (filters.hiddenRegimes.length > 0) n++;
    if (filters.owners.length > 0) n++;
    if (filters.maxAltitudeKm > 0) n++;
    return n;
    // `filters` est reconstruit à chaque rendu (fusion avec les valeurs par
    // défaut) : dépendre de l'objet entier ne mémoïserait rien. On dépend donc
    // de ses champs, ce qui garantit aussi le recalcul à chaque changement réel.
  }, [
    filters.hiddenCategories,
    filters.hiddenRegimes,
    filters.owners,
    filters.maxAltitudeKm,
  ]);

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
          refreshing={refreshing}
          onRefresh={() => refresh(true)}
          onToggleFilters={() => setFiltersOpen(true)}
          onToggleSettings={() => setSettingsOpen(true)}
          onToggleLegend={() => setLegendOpen(!legendOpen)}
          legendOpen={legendOpen}
          activeFilterCount={activeFilterCount}
        />

        <main className="stage">
          <GlobeView
            satellites={satellites}
            visible={visible}
            frameRef={propagation.frameRef}
            selectedIndex={selectedIndex}
            orbit={propagation.orbit}
            orbits={propagation.orbits}
            hoverOrbit={propagation.hoverOrbit}
            onSelect={setSelectedIndex}
            onHover={previewOrbit}
            focusNonce={focusNonce}
            moonFocusNonce={moonFocusNonce}
            earthFocusNonce={earthFocusNonce}
            settings={settings}
            timeRate={propagation.rate}
            creditContainer={creditRef}
            simNow={propagation.simNow}
          />

          {/* `tip` n'est accepté par Spin qu'autour d'un contenu : le libellé est
              donc rendu à côté, ce qui évite l'avertissement d'Ant Design. */}
          {loading && (
            <div className="overlay">
              <div className="overlay-stack">
                <Spin size="large" />
                <span>Récupération des éléments orbitaux…</span>
              </div>
            </div>
          )}

          {/*
            Voile d'initialisation **borné dans le temps**. Un spinner qui tourne
            indéfiniment a masqué pendant des jours un worker qui ne démarrait
            pas : passé le délai de garde, on affiche l'anomalie au lieu de
            laisser croire que le calcul progresse.
          */}
          {!loading && satellites && satellites.length > 0 && !propagation.ready && !initTimedOut && (
            <div className="overlay overlay-soft">
              <div className="overlay-stack">
                <Spin />
                <span>Initialisation de la propagation SGP4…</span>
              </div>
            </div>
          )}

          {!loading &&
            satellites &&
            satellites.length > 0 &&
            !propagation.ready &&
            initTimedOut && (
              <Alert
                className="floating-alert"
                type="error"
                showIcon
                message="Le calcul des positions n’a pas démarré"
                description={
                  <>
                    <div>
                      {nf.format(satellites.length)} objets ont bien été reçus du serveur, mais
                      le moteur de propagation n’a pas répondu au bout de{' '}
                      {INIT_TIMEOUT_MS / 1000} secondes.
                    </div>
                    <div className="alert-hint">
                      Ouvrez la console du navigateur : l’erreur y sera visible. Puis
                      rechargez la page en forçant le cache (Cmd + Maj + R).
                    </div>
                  </>
                }
              />
            )}

          {/* Repli sur le thread principal : l'application fonctionne, en moins fluide. */}
          {propagation.fallbackReason && (
            <Alert
              className="floating-alert floating-alert-low"
              type="warning"
              showIcon
              closable
              message="Calcul sur le thread principal"
              description={`Le worker de calcul n’a pas démarré (${propagation.fallbackReason}). Les positions sont calculées dans la page : l’affichage reste correct mais peut être moins fluide.`}
            />
          )}

          {error && (
            <Alert
              className="floating-alert"
              type="error"
              showIcon
              closable
              message={error}
              description="Vérifiez que le serveur est démarré (port 3001) et que l'accès à celestrak.org est possible."
            />
          )}

          {/* Récupération en cours côté serveur : le catalogue n'est pas encore
              arrivé, mais la page n'est pas bloquée pour autant. */}
          {!error && snapshot?.fetching && satellites?.length === 0 && !sourcesFailed && (
            <div className="overlay">
              <div className="overlay-stack">
                <Spin size="large" />
                <span>Récupération des éléments orbitaux en cours…</span>
                <span className="overlay-detail">
                  Le catalogue complet représente plusieurs mégaoctets. L’affichage se
                  mettra à jour tout seul.
                </span>
              </div>
            </div>
          )}

          {/* Indisponibilité des sources : décompte vivant et relance
              automatique à l'échéance, plutôt qu'un message figé. */}
          {!error && !loading && snapshot && sourcesFailed && (
            <SourceAlert snapshot={snapshot} onRetry={() => refresh(false)} />
          )}

          {legendOpen && snapshot && (
            <aside className="left-dock">
              <LegendPanel
                categories={snapshot.categories}
                showShapes={settings.satelliteIcons}
                onClose={() => setLegendOpen(false)}
              />
            </aside>
          )}

          {selected && (
            <aside className="right-dock">
              <SatelliteDetails
                satellite={selected}
                state={
                  propagation.detail?.index === selectedIndex ? propagation.detail.state : undefined
                }
                family={selected.family ? snapshot?.families?.[selected.family] : undefined}
                favorite={favorites.includes(selected.noradId)}
                onToggleFavorite={toggleFavorite}
                onFocus={() => setFocusNonce((n) => n + 1)}
                onClose={() => setSelectedIndex(null)}
              />
            </aside>
          )}
        </main>

        <StatusBar
          ref={creditRef}
          snapshot={snapshot}
          propagableCount={propagation.propagableCount}
          visibleCount={visibleCount}
          baseMap={settings.baseMap}
          suppressed={suppressed}
        />

        <Drawer
          title="Filtres d'affichage"
          placement="left"
          width={400}
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
        >
          <FiltersPanel
            categories={snapshot?.categories ?? []}
            regimes={snapshot?.regimes ?? []}
            owners={snapshot?.owners ?? []}
            filters={filters}
            onChange={setFilters}
            visibleCount={visibleCount}
            totalCount={snapshot?.count ?? 0}
          />
        </Drawer>

        <Drawer
          title="Réglages d'affichage"
          placement="left"
          width={400}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        >
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            visibleCount={visibleCount}
            onFocusMoon={() => {
              setMoonFocusNonce((n) => n + 1);
              setSettingsOpen(false);
            }}
            onFocusEarth={() => {
              setEarthFocusNonce((n) => n + 1);
              setSettingsOpen(false);
            }}
          />
        </Drawer>
      </div>
    </ConfigProvider>
  );
}
