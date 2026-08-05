/**
 * WORKER — enveloppe autour du moteur de propagation.
 *
 * Toute la logique est dans `propagation/engine.ts`, partagée avec le repli sur
 * thread principal. Ce fichier ne fait que la traduction messages ↔ moteur, et
 * la cadence d'envoi des trames.
 *
 * 16 000 propagations coûtent ~80 ms : les faire dans la boucle d'animation
 * ferait tomber le rendu à quelques images par seconde. D'où le worker, et
 * l'extrapolation par la vitesse entre deux trames côté rendu.
 */
import { PropagationEngine } from '../propagation/engine';
import type { WorkerRequest, WorkerResponse } from '../types';

/** Cadence d'envoi des trames au thread principal (ms). */
const FRAME_INTERVAL_MS = 500;

const engine = new PropagationEngine();
let timer: ReturnType<typeof setInterval> | undefined;

const post = (message: WorkerResponse, transfer: Transferable[] = []): void => {
  (self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(
    message,
    transfer,
  );
};

function sendFrame(): void {
  const frame = engine.computeFrame();
  if (!frame) return;

  if (frame.detail) {
    post({ type: 'detail', index: frame.detail.index, state: frame.detail.state });
  }
  post(
    {
      type: 'frame',
      simEpochMs: frame.simEpochMs,
      positions: frame.positions,
      velocities: frame.velocities,
      valid: frame.valid,
    },
    [frame.positions.buffer, frame.velocities.buffer],
  );
}

function start(): void {
  if (timer !== undefined) return;
  sendFrame();
  timer = setInterval(sendFrame, FRAME_INTERVAL_MS);
}

function stop(): void {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

self.addEventListener('message', (event: MessageEvent) => {
  const request = event.data as WorkerRequest;

  switch (request.type) {
    case 'init': {
      stop();
      const valid = engine.init(request.elements);
      post({ type: 'ready', count: request.elements.length, valid });
      start();
      break;
    }
    case 'clock':
      engine.setClock(request.simEpochMs, request.rate);
      sendFrame();
      break;
    case 'orbit': {
      const positions = engine.computeOrbit(request.index);
      if (positions) post({ type: 'orbit', index: request.index, positions }, [positions.buffer]);
      break;
    }
    case 'previewOrbit': {
      const positions = engine.computeOrbit(request.index);
      if (positions) {
        post({ type: 'previewOrbit', index: request.index, positions }, [positions.buffer]);
      }
      break;
    }
    case 'orbits': {
      const batch = engine.computeOrbits(request.indices);
      post({ type: 'orbits', ...batch }, [batch.positions.buffer]);
      break;
    }
    case 'detail':
      engine.setDetailIndex(request.index);
      break;
    case 'stop':
      stop();
      break;
  }
});
