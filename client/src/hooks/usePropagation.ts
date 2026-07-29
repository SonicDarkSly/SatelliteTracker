/**
 * Pilotage du worker de propagation.
 *
 * Le hook expose des tampons stables (Float32Array) que la couche de rendu lit
 * à chaque image, sans passer par l'état React : re-render à 60 Hz sur 11 000
 * objets serait ingérable. Seules les informations « lentes » (compteurs,
 * détail du satellite sélectionné) transitent par useState.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SatelliteRecord, SatelliteState, WorkerResponse } from '../types';

export interface PropagationFrame {
  /** Positions ECEF en mètres (3 par objet), instant `simEpochMs`. */
  positions: Float32Array;
  /** Vitesses ECEF en m/s (3 par objet), pour extrapoler entre deux trames. */
  velocities: Float32Array;
  valid: Uint8Array;
  simEpochMs: number;
  /** Horloge locale à la réception (base de l'extrapolation). */
  receivedAt: number;
}

/** Lot d'orbites des objets affichés. */
export interface OrbitBatch {
  indices: number[];
  samples: number;
  positions: Float32Array;
}

export interface Propagation {
  /** Dernière trame reçue (référence mutable, lue dans la boucle de rendu). */
  frameRef: React.MutableRefObject<PropagationFrame | undefined>;
  /** Ellipse orbitale du satellite suivi, ECEF en mètres. */
  orbit: { index: number; positions: Float32Array } | undefined;
  /** Orbites des objets affichés (vide si le réglage est désactivé ou plafond dépassé). */
  orbits: OrbitBatch | undefined;
  /** Demande le tracé des orbites de ces objets (tableau vide pour tout effacer). */
  setOrbitTargets: (indices: number[]) => void;
  /** Orbite de l'objet survolé, indépendante de la sélection. */
  hoverOrbit: { index: number; positions: Float32Array } | undefined;
  /** Demande l'orbite de l'objet survolé ; `null` l'effface. */
  previewOrbit: (index: number | null) => void;
  /** Position géodésique du satellite suivi, rafraîchie à chaque trame. */
  detail: { index: number; state: SatelliteState } | undefined;
  ready: boolean;
  /** Nombre d'objets dont le TLE est propageable. */
  propagableCount: number;
  rate: number;
  setRate: (rate: number) => void;
  /** Décale l'horloge simulée (en minutes) ; 0 = revenir à l'instant présent. */
  seek: (offsetMinutes: number) => void;
  /** Suit un objet : orbite + détail géodésique. `null` pour arrêter. */
  track: (index: number | null) => void;
  /** Instant simulé courant (ms epoch). */
  simNow: () => number;
}

export function usePropagation(satellites: SatelliteRecord[] | undefined): Propagation {
  const workerRef = useRef<Worker | undefined>(undefined);
  const frameRef = useRef<PropagationFrame | undefined>(undefined);
  const clockRef = useRef({ anchorWallMs: Date.now(), anchorSimMs: Date.now(), rate: 1 });
  const trackedRef = useRef<number | null>(null);

  const orbitTargetsRef = useRef<number[]>([]);
  /** Objet survolé dont l'orbite a été demandée (évite les demandes répétées). */
  const hoverTargetRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [propagableCount, setPropagableCount] = useState(0);
  const [orbit, setOrbit] = useState<Propagation['orbit']>();
  const [orbits, setOrbits] = useState<OrbitBatch | undefined>();
  const [hoverOrbit, setHoverOrbit] = useState<Propagation['hoverOrbit']>();
  const [detail, setDetail] = useState<Propagation['detail']>();
  const [rate, setRateState] = useState(1);

  // Création du worker (une seule fois) et branchement des réponses.
  useEffect(() => {
    const worker = new Worker(new URL('../workers/propagation.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      switch (message.type) {
        case 'ready': {
          let ok = 0;
          for (const v of message.valid) ok += v;
          setPropagableCount(ok);
          setReady(true);
          break;
        }
        case 'frame':
          frameRef.current = {
            positions: message.positions,
            velocities: message.velocities,
            valid: message.valid,
            simEpochMs: message.simEpochMs,
            receivedAt: performance.now(),
          };
          break;
        case 'orbit':
          setOrbit({ index: message.index, positions: message.positions });
          break;
        case 'previewOrbit':
          // Le curseur a pu changer de cible pendant le calcul : on écarte les
          // réponses qui ne correspondent plus à l'objet survolé.
          if (hoverTargetRef.current === message.index) {
            setHoverOrbit({ index: message.index, positions: message.positions });
          }
          break;
        case 'orbits':
          setOrbits({
            indices: message.indices,
            samples: message.samples,
            positions: message.positions,
          });
          break;
        case 'detail':
          setDetail({ index: message.index, state: message.state });
          break;
      }
    };

    return () => {
      worker.postMessage({ type: 'stop' });
      worker.terminate();
      workerRef.current = undefined;
    };
  }, []);

  // Chargement du catalogue dans le worker dès qu'il est disponible.
  useEffect(() => {
    if (!workerRef.current || !satellites) return;

    frameRef.current = undefined;

    /*
     * Catalogue vide (sources indisponibles) : il n'y a rien à propager, mais il
     * faut malgré tout se déclarer prêt. Sinon l'interface reste bloquée sur
     * « initialisation de la propagation » indéfiniment, alors que le vrai
     * problème est l'absence de données — message que l'utilisateur ne voit
     * jamais, caché derrière le voile de chargement.
     */
    if (satellites.length === 0) {
      setReady(true);
      setPropagableCount(0);
      return;
    }

    setReady(false);
    workerRef.current.postMessage({
      type: 'init',
      elements: satellites.map((s) => s.omm),
    });
  }, [satellites]);

  // Rafraîchissement périodique des orbites : elles sont figées dans le repère
  // inertiel au moment du calcul et « glissent » donc lentement par rapport au
  // repère terrestre affiché. Le satellite suivi est réactualisé plus souvent
  // que le lot, dont le recalcul est plus lourd.
  useEffect(() => {
    const tracked = window.setInterval(() => {
      const index = trackedRef.current;
      if (index !== null && workerRef.current) {
        workerRef.current.postMessage({ type: 'orbit', index });
      }
    }, 2000);

    const batch = window.setInterval(() => {
      if (orbitTargetsRef.current.length > 0 && workerRef.current) {
        workerRef.current.postMessage({ type: 'orbits', indices: orbitTargetsRef.current });
      }
    }, 6000);

    return () => {
      window.clearInterval(tracked);
      window.clearInterval(batch);
    };
  }, []);

  const previewOrbit = useCallback((index: number | null) => {
    if (hoverTargetRef.current === index) return;
    hoverTargetRef.current = index;

    if (index === null) {
      setHoverOrbit(undefined);
      return;
    }
    workerRef.current?.postMessage({ type: 'previewOrbit', index });
  }, []);

  const setOrbitTargets = useCallback((indices: number[]) => {
    orbitTargetsRef.current = indices;
    if (indices.length === 0) {
      setOrbits(undefined);
      return;
    }
    workerRef.current?.postMessage({ type: 'orbits', indices });
  }, []);

  const pushClock = useCallback((simEpochMs: number, nextRate: number) => {
    clockRef.current = { anchorWallMs: Date.now(), anchorSimMs: simEpochMs, rate: nextRate };
    workerRef.current?.postMessage({ type: 'clock', simEpochMs, rate: nextRate });
  }, []);

  const simNow = useCallback(() => {
    const { anchorWallMs, anchorSimMs, rate: r } = clockRef.current;
    return anchorSimMs + (Date.now() - anchorWallMs) * r;
  }, []);

  const setRate = useCallback(
    (nextRate: number) => {
      setRateState(nextRate);
      pushClock(simNow(), nextRate);
    },
    [pushClock, simNow],
  );

  const seek = useCallback(
    (offsetMinutes: number) => {
      const target =
        offsetMinutes === 0 ? Date.now() : simNow() + offsetMinutes * 60_000;
      pushClock(target, clockRef.current.rate);
    },
    [pushClock, simNow],
  );

  const track = useCallback((index: number | null) => {
    trackedRef.current = index;
    setOrbit(undefined);
    setDetail(undefined);
    workerRef.current?.postMessage({ type: 'detail', index });
    if (index !== null) workerRef.current?.postMessage({ type: 'orbit', index });
  }, []);

  return useMemo(
    () => ({
      frameRef,
      orbit,
      orbits,
      setOrbitTargets,
      hoverOrbit,
      previewOrbit,
      detail,
      ready,
      propagableCount,
      rate,
      setRate,
      seek,
      track,
      simNow,
    }),
    [
      orbit,
      orbits,
      setOrbitTargets,
      hoverOrbit,
      previewOrbit,
      detail,
      ready,
      propagableCount,
      rate,
      setRate,
      seek,
      track,
      simNow,
    ],
  );
}
