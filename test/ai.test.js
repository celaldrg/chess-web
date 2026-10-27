import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, START_FEN, parseSquare } from '../src/position.js';
import { LEVELS, MATE_SCORE, chooseMove, orderMoves, searchBestMove } from '../src/ai.js';
import { evaluate } from '../src/eval.js';
import { createRng } from '../src/rng.js';
import { createDemoGame } from '../src/game.js';

const BACK_RANK_MATE = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
const BLACK_MATES = '3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1';

/** Fake clock: advances `step` ms on every read. */
function fakeClock(step) {
  let time = 0;
  return () => (time += step);
}

test('seeded RNG is deterministic and in [0, 1)', () => {
  const a = createRng(42);
  const b = createRng(42);
  const values = Array.from({ length: 100 }, () => a());
  assert.deepEqual(values, Array.from({ length: 100 }, () => b()));
  assert.ok(values.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(values.slice(0, 5), Array.from({ length: 5 }, createRng(7)));
});

test('evaluation is symmetric and counts material', () => {
  assert.equal(evaluate(Position.fromFen(START_FEN)), 0);
  const upQueen = Position.fromFen('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
  assert.ok(evaluate(upQueen) > 800);
  assert.equal(evaluate(Position.fromFen('3qk3/8/8/8/8/8/8/4K3 b - - 0 1')), evaluate(upQueen));
});

test('MVV-LVA puts the best capture first', () => {
  const pos = Position.fromFen('4k3/8/8/3q4/2P1r3/8/3R4/K7 w - - 0 1');
  const [first] = orderMoves(pos.legalMoves());
  assert.equal(first.from, parseSquare('c4'));
  assert.equal(first.to, parseSquare('d5'));
});

test('medium finds a mate in 1', () => {
  assert.deepEqual(chooseMove(BACK_RANK_MATE, 'medium'), { from: 'd1', to: 'd8' });
  assert.deepEqual(chooseMove(BLACK_MATES, 'medium'), { from: 'd8', to: 'd1' });
  const result = searchBestMove(Position.fromFen(BACK_RANK_MATE), LEVELS.medium);
  assert.equal(result.score, MATE_SCORE - 1);
});

test('easy and hard also find a mate in 1', () => {
  assert.deepEqual(chooseMove(BACK_RANK_MATE, 'easy', { rng: createRng(3) }), { from: 'd1', to: 'd8' });
  assert.deepEqual(chooseMove(BACK_RANK_MATE, 'hard', { now: fakeClock(1) }), { from: 'd1', to: 'd8' });
});

test('medium wins a hanging queen', () => {
  assert.deepEqual(chooseMove('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', 'medium'), { from: 'd2', to: 'd5' });
});

test('AI promotes a pawn', () => {
  assert.deepEqual(chooseMove('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'medium'), { from: 'a7', to: 'a8', promotion: 'q' });
});

test('easy is deterministic for a seed and plays legal moves', () => {
  const fen = createDemoGame().fen();
  const legal = Position.fromFen(fen).legalMoves().length;
  assert.ok(legal > 1);
  const first = chooseMove(fen, 'easy', { rng: createRng(9) });
  assert.deepEqual(chooseMove(fen, 'easy', { rng: createRng(9) }), first);
  const game = createDemoGame();
  assert.ok(game.move(first), 'easy move must be legal');
});

test('hard stops at the time limit but still returns a move', () => {
  const pos = Position.fromFen(createDemoGame().fen());
  const result = searchBestMove(pos, { ...LEVELS.hard, now: fakeClock(400) });
  assert.ok(result.move);
  assert.ok(result.depth >= 1 && result.depth < LEVELS.hard.maxDepth);
  assert.equal(pos.toFen(), createDemoGame().fen(), 'search restores the position');
});

test('hard searches deeper than medium given time', () => {
  const pos = Position.fromFen(START_FEN);
  const result = searchBestMove(pos, { ...LEVELS.hard, maxDepth: 4, now: fakeClock(0) });
  assert.equal(result.depth, 4);
});

test('no move when the game is over', () => {
  assert.equal(chooseMove('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', 'medium'), null);
  assert.throws(() => chooseMove(START_FEN, 'impossible'));
});
