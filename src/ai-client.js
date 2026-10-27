/**
 * Talks to the AI Web Worker (src/ai-worker.js). If a module worker cannot
 * start, the search runs on the main thread instead so the game still works.
 */
import { chooseMove } from './ai.js';
import { createRng } from './rng.js';

function randomSeed() {
  return Math.floor(Math.random() * 0x100000000);
}

function searchHere({ fen, level, seed }) {
  return chooseMove(fen, level, { rng: createRng(seed) });
}

/**
 * Creates the AI client. Only one search runs at a time.
 * @returns {{think: (fen: string, level: string) => Promise<{from: string, to: string, promotion?: string}|null>, cancel: () => void}}
 */
export function createAiClient() {
  let worker = null;
  let workerFailed = false;
  let pending = null;
  let nextId = 0;

  function finish(id, move) {
    if (!pending || pending.request.id !== id) return;
    const { resolve } = pending;
    pending = null;
    resolve(move);
  }

  function stopWorker() {
    worker?.terminate();
    worker = null;
  }

  function onWorkerError(event) {
    event.preventDefault();
    workerFailed = true;
    stopWorker();
    if (pending) finish(pending.request.id, searchHere(pending.request));
  }

  function startWorker() {
    if (worker || workerFailed) return worker;
    try {
      worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
      worker.addEventListener('message', (event) => finish(event.data.id, event.data.move));
      worker.addEventListener('error', onWorkerError);
    } catch {
      workerFailed = true;
      worker = null;
    }
    return worker;
  }

  /** Stops the running search; its promise resolves with null. */
  function cancel() {
    if (!pending) return;
    finish(pending.request.id, null);
    stopWorker();
  }

  /**
   * Asks for a move. Cancels any search still running.
   * @param {string} fen
   * @param {'easy'|'medium'|'hard'} level
   */
  function think(fen, level) {
    cancel();
    const request = { id: ++nextId, fen, level, seed: randomSeed() };
    return new Promise((resolve) => {
      pending = { request, resolve };
      const target = startWorker();
      if (target) target.postMessage(request);
      else setTimeout(() => finish(request.id, searchHere(request)), 0);
    });
  }

  return { think, cancel };
}
