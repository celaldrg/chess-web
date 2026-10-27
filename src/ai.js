/**
 * Computer opponent: iterative-deepening negamax with alpha-beta pruning,
 * MVV-LVA move ordering and quiescence search. Pure module, usable from a
 * module Web Worker (see ai-worker.js).
 */
import { Position, pieceType, toPlainMove } from './position.js';
import { evaluate } from './eval.js';
import { createRng } from './rng.js';

export const MATE_SCORE = 100000;
const MAX_PLY = 64;
const INFINITY = 1e9;
const TIME_CHECK_INTERVAL = 1024;

/** Search settings per difficulty level. */
export const LEVELS = Object.freeze({
  easy: Object.freeze({ maxDepth: 1, randomMargin: 60 }),
  medium: Object.freeze({ maxDepth: 3 }),
  hard: Object.freeze({ maxDepth: 6, timeLimitMs: 1500 }),
});

/**
 * Ordering score: captures by most valuable victim / least valuable attacker,
 * then promotions, then quiet moves.
 * @param {import('./position.js').Move} move
 * @returns {number}
 */
export function orderScore(move) {
  let score = 0;
  if (move.captured) score += 100 + 10 * pieceType(move.captured) - pieceType(move.piece);
  if (move.promotion) score += 90 + move.promotion;
  return score;
}

/**
 * Sorts moves best-first for alpha-beta (stable, so deterministic).
 * @param {import('./position.js').Move[]} moves
 * @returns {import('./position.js').Move[]} a new array
 */
export function orderMoves(moves) {
  return moves
    .map((move) => ({ move, score: orderScore(move) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);
}

/** True when a score means "mate found for the side to move". */
function isMateFor(score) {
  return score > MATE_SCORE - MAX_PLY;
}

class Search {
  constructor(pos, deadline, now) {
    this.pos = pos;
    this.deadline = deadline;
    this.now = now;
    this.nodes = 0;
    this.stopped = false;
    this.canStop = false;
  }

  tick() {
    this.nodes += 1;
    if (this.canStop && this.nodes % TIME_CHECK_INTERVAL === 0 && this.now() >= this.deadline) {
      this.stopped = true;
    }
    return this.stopped;
  }

  /** Scores every root move with a full window (used for the random easy level). */
  scoreAll(depth, moves) {
    return moves.map((move) => {
      this.pos.makeMove(move);
      const score = -this.negamax(depth - 1, -INFINITY, INFINITY, 1);
      this.pos.undoMove();
      return { move, score };
    });
  }

  root(depth, moves) {
    let best = { move: moves[0], score: -INFINITY };
    for (const move of moves) {
      this.pos.makeMove(move);
      const score = -this.negamax(depth - 1, -INFINITY, -best.score, 1);
      this.pos.undoMove();
      if (this.stopped) break;
      if (score > best.score) best = { move, score };
    }
    return best;
  }

  negamax(depth, alpha, beta, ply) {
    if (this.tick()) return 0;
    const pos = this.pos;
    const inCheck = pos.inCheck();
    if (depth <= 0 && !inCheck) return this.quiesce(alpha, beta, ply);
    if (pos.halfmove >= 100) return 0;
    if (ply >= MAX_PLY) return evaluate(pos);
    let legal = 0;
    for (const move of orderMoves(pos.pseudoMoves())) {
      if (!pos.tryMove(move)) continue;
      legal += 1;
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      pos.undoMove();
      if (this.stopped) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    if (!legal) return inCheck ? -MATE_SCORE + ply : 0;
    return alpha;
  }

  quiesce(alpha, beta, ply) {
    if (this.tick()) return 0;
    const pos = this.pos;
    const standPat = evaluate(pos);
    if (standPat >= beta || ply >= MAX_PLY) return standPat >= beta ? beta : standPat;
    if (standPat > alpha) alpha = standPat;
    for (const move of orderMoves(pos.pseudoMoves(true))) {
      if (!pos.tryMove(move)) continue;
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      pos.undoMove();
      if (this.stopped) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
}

function pickNearBest(scored, margin, rng) {
  const best = Math.max(...scored.map((s) => s.score));
  const pool = isMateFor(best) ? scored.filter((s) => s.score === best) : scored.filter((s) => s.score >= best - margin);
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Searches the best move by iterative deepening.
 * @param {Position} pos position to search (restored when done)
 * @param {object} options
 * @param {number} options.maxDepth deepest iteration
 * @param {number} [options.timeLimitMs] stop deepening after this long
 * @param {number} [options.randomMargin] pick randomly among moves within this many centipawns
 * @param {() => number} [options.rng] seeded random function
 * @param {() => number} [options.now] clock in milliseconds
 * @returns {{move: import('./position.js').Move, score: number, depth: number, nodes: number}|null}
 *   null when there is no legal move
 */
export function searchBestMove(pos, { maxDepth, timeLimitMs = Infinity, randomMargin = 0, rng = createRng(1), now = Date.now }) {
  let ordered = orderMoves(pos.legalMoves());
  if (!ordered.length) return null;
  const search = new Search(pos, now() + timeLimitMs, now);
  let best = null;
  for (let depth = 1; depth <= maxDepth; depth++) {
    search.canStop = depth > 1;
    const result = randomMargin ? pickNearBest(search.scoreAll(depth, ordered), randomMargin, rng) : search.root(depth, ordered);
    if (search.stopped) break;
    best = { ...result, depth, nodes: search.nodes };
    ordered = [result.move, ...ordered.filter((m) => m !== result.move)];
    if (isMateFor(result.score)) break;
  }
  return best;
}

/**
 * Chooses a move for the side to move at a difficulty level.
 * @param {string} fen
 * @param {'easy'|'medium'|'hard'} level
 * @param {{rng?: () => number, now?: () => number}} [options]
 * @returns {{from: string, to: string, promotion?: string}|null}
 */
export function chooseMove(fen, level, { rng = createRng(1), now = Date.now } = {}) {
  const settings = LEVELS[level];
  if (!settings) throw new Error(`Unknown level "${level}"`);
  const result = searchBestMove(Position.fromFen(fen), { ...settings, rng, now });
  return result && toPlainMove(result.move);
}
