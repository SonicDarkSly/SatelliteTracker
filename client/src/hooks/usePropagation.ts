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

  const [ready, setReady] = useState(false);
  const [propagableCount, setPropagableCount] = useState(0);
  const [orbit, setOrbit] = useState<Propagation['orbit']>();
  const [orbits, setOrbits] = useState<OrbitBatch | undefined>();
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
    if (!workerRef.current || !satellites || satellites.length === 0) return;
    setReady(false);
    frameRef.current = undefined;
    workerRef.current.postMessage({
      type: 'init',
      tles: satellites.map((s) => ({ line1: s.line1, line2: s.line2 })),
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
