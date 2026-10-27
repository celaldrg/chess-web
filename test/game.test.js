import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START_FEN } from '../src/position.js';
import { DEMO_MOVES, createDemoGame, createGame } from '../src/game.js';

test('a new game starts from the initial position', () => {
  const state = createGame().getState();
  assert.equal(state.fen, START_FEN);
  assert.equal(state.turn, 'w');
  assert.equal(state.state, 'playing');
  assert.equal(state.result, '*');
  assert.equal(state.moves.length, 20);
  assert.deepEqual(state.history, []);
  assert.equal(state.lastMove, null);
  assert.equal(state.checkSquare, null);
  assert.equal(state.moveNumber, 1);
});

test('board() is rank 8 first with algebraic squares', () => {
  const board = createGame().board();
  assert.equal(board.length, 8);
  assert.deepEqual(board[0][0], { square: 'a8', color: 'b', type: 'r' });
  assert.deepEqual(board[7][4], { square: 'e1', color: 'w', type: 'k' });
  assert.equal(board[4][4], null);
});

test('moves(from) lists targets of one piece', () => {
  const game = createGame();
  const targets = game.moves('g1').map((m) => m.to).sort();
  assert.deepEqual(targets, ['f3', 'h3']);
  assert.deepEqual(game.moves('e4'), []);
});

test('move, lastMove and undo', () => {
  const game = createGame();
  const record = game.move({ from: 'e2', to: 'e4' });
  assert.deepEqual(record, { from: 'e2', to: 'e4', capture: false, san: 'e4' });
  assert.deepEqual(game.lastMove(), { from: 'e2', to: 'e4' });
  assert.equal(game.turn(), 'b');
  assert.deepEqual(game.undo(), record);
  assert.equal(game.fen(), START_FEN);
  assert.equal(game.undo(), null);
});

test('check is reported with the king square', () => {
  const game = createGame();
  for (const san of ['e4', 'f5', 'Qh5+']) game.moveSan(san);
  const state = game.getState();
  assert.equal(state.check, true);
  assert.equal(state.checkSquare, 'e8');
  assert.equal(state.state, 'playing');
});

test('getState after mate has no moves', () => {
  const game = createGame();
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) game.moveSan(san);
  const state = game.getState();
  assert.equal(state.state, 'checkmate');
  assert.equal(state.checkSquare, 'e1');
  assert.deepEqual(state.moves, []);
});

test('demo game is an Italian opening ten moves deep', () => {
  const game = createDemoGame();
  assert.deepEqual(game.history(), [...DEMO_MOVES]);
  assert.equal(game.history().length, 20);
  assert.deepEqual(game.lastMove(), { from: 'f8', to: 'e8' });
  assert.equal(game.fen(), 'r1bqr1k1/bpp2pp1/p1np1n1p/4p3/4P3/1BPP1N1P/PP1N1PP1/R1BQR1K1 w - - 2 11');
  assert.equal(game.status().state, 'playing');
});
