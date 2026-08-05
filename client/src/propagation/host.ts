/**
 * Choix de l'hôte de calcul : worker si possible, thread principal sinon.
 *
 * Les deux hôtes exposent la même interface que `Worker` (postMessage +
 * onmessage), ce qui permet au hook de pilotage de les traiter indifféremment.
 *
 * Pourquoi un repli : le worker peut échouer à démarrer sans que rien ne le
 * signale — satellite.js est un paquet ESM pur, et son chargement dans un module
 * worker dépend de la configuration du bundler. Un tel échec laissait
 * l'application sur un voile « initialisation » perpétuel, pendant des jours,
 * sans un seul message d'erreur. Mieux vaut un calcul sur le thread principal,
 * moins fluide mais visible et fonctionnel.
 */
import { PropagationEngine } from './engine';
import type { WorkerRequest, WorkerResponse } from '../types';

/** Ce que le hook attend d'un hôte de calcul. */
export interface PropagationHost {
  post(request: WorkerRequest): void;
  dispose(): void;
  /** 'worker' ou 'principal' : affiché dans la barre d'état. */
  readonly kind: 'worker' | 'principal';
}

/** Cadence d'envoi des trames (ms), identique dans les deux hôtes. */
const FRAME_INTERVAL_MS = 500;

/**
 * Hôte de repli : le même moteur, exécuté sur le thread principal.
 *
 * Les trames sont produites par `setInterval` et remises de façon asynchrone
 * pour ne pas réentrer dans le rendu React pendant un événement.
 */
class MainThreadHost implements PropagationHost {
  readonly kind = 'principal' as const;
  private readonly engine = new PropagationEngine();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly onMessage: (message: WorkerResponse) => void) {}

  post(request: WorkerRequest): void {
    switch (request.type) {
      case 'init': {
        this.stop();
        const valid = this.engine.init(request.elements);
        this.emit({ type: 'ready', count: request.elements.length, valid });
        this.start();
        break;
      }
      case 'clock':
        this.engine.setClock(request.simEpochMs, request.rate);
        this.sendFrame();
        break;
      case 'orbit': {
        const positions = this.engine.computeOrbit(request.index);
        if (positions) this.emit({ type: 'orbit', index: request.index, positions });
        break;
      }
      case 'previewOrbit': {
        const positions = this.engine.computeOrbit(request.index);
        if (positions) this.emit({ type: 'previewOrbit', index: request.index, positions });
        break;
      }
      case 'orbits':
        this.emit({ type: 'orbits', ...this.engine.computeOrbits(request.indices) });
        break;
      case 'detail':
        this.engine.setDetailIndex(request.index);
        break;
      case 'stop':
        this.stop();
        break;
    }
  }

  dispose(): void {
    this.stop();
  }

  private emit(message: WorkerResponse): void {
    // Report au tick suivant : on ne veut pas déclencher un rendu React au
    // milieu du traitement d'un message.
    setTimeout(() => this.onMessage(message), 0);
  }

  private sendFrame(): void {
    const frame = this.engine.computeFrame();
    if (!frame) return;
    if (frame.detail) {
      this.emit({ type: 'detail', index: frame.detail.index, state: frame.detail.state });
    }
    this.emit({
      type: 'frame',
      simEpochMs: frame.simEpochMs,
      positions: frame.positions,
      velocities: frame.velocities,
      valid: frame.valid,
    });
  }

  private start(): void {
    if (this.timer !== undefined) return;
    this.sendFrame();
    this.timer = setInterval(() => this.sendFrame(), FRAME_INTERVAL_MS);
  }

  private stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Hôte normal : le worker. */
class WorkerHost implements PropagationHost {
  readonly kind = 'worker' as const;

  constructor(private readonly worker: Worker) {}

  post(request: WorkerRequest): void {
    this.worker.postMessage(request);
  }

  dispose(): void {
    this.worker.postMessage({ type: 'stop' } satisfies WorkerRequest);
    this.worker.terminate();
  }
}

/**
 * Crée l'hôte de calcul.
 *
 * Le worker est tenté d'abord. Toute erreur — construction impossible, échec de
 * chargement du module, erreur d'exécution avant le premier message — provoque
 * la bascule sur le thread principal, et `onFallback` est appelé avec le motif
 * pour que l'interface puisse le dire à l'utilisateur.
 */
export function createPropagationHost(
  onMessage: (message: WorkerResponse) => void,
  onFallback: (reason: string) => void,
): PropagationHost {
  try {
    const worker = new Worker(new URL('../workers/propagation.worker.ts', import.meta.url), {
      type: 'module',
    });

    let host: PropagationHost = new WorkerHost(worker);
    let switched = false;

    /** Bascule définitive vers le thread principal. */
    const fallback = (reason: string): void => {
      if (switched) return;
      switched = true;
      try {
        worker.terminate();
      } catch {
        /* déjà mort */
      }
      onFallback(reason);
      const replacement = new MainThreadHost(onMessage);
      // On remplace l'implémentation derrière l'objet renvoyé, de sorte que
      // l'appelant n'ait pas à se soucier de la bascule.
      host = replacement;
      Object.assign(proxy, {
        post: (r: WorkerRequest) => replacement.post(r),
        dispose: () => replacement.dispose(),
        kind: replacement.kind,
      });
      // Le catalogue déjà transmis au worker défunt doit être renvoyé : le hook
      // s'en charge en réagissant au changement de `kind`.
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => onMessage(event.data);
    worker.onerror = (event: ErrorEvent) => {
      fallback(event.message || 'erreur de chargement du worker');
    };
    worker.onmessageerror = () => fallback('message illisible reçu du worker');

    const proxy: PropagationHost = {
      post: (r: WorkerRequest) => host.post(r),
      dispose: () => host.dispose(),
      kind: 'worker',
    };
    return proxy;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    onFallback(`worker indisponible (${reason})`);
    return new MainThreadHost(onMessage);
  }
}
