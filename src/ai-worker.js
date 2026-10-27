/**
 * Module Web Worker wrapper around the AI so the page never freezes.
 * Request:  { id, fen, level, seed }
 * Response: { id, move } where move is {from, to, promotion?} or null.
 */
import { chooseMove } from './ai.js';
import { createRng } from './rng.js';

self.addEventListener('message', (event) => {
  const { id, fen, level, seed } = event.data;
  const move = chooseMove(fen, level, { rng: createRng(seed), now: () => performance.now() });
  self.postMessage({ id, move });
});
