import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, START_FEN, parseSquare, squareName } from '../src/position.js';
import { createGame } from '../src/game.js';

function playAll(game, sans) {
  for (const san of sans) assert.ok(game.moveSan(san), `move ${san} should be legal`);
}

function sanList(fen) {
  return createGame({ fen }).moves().map((m) => `${m.from}${m.to}${m.promotion || ''}`);
}

test('square names convert both ways', () => {
  assert.equal(parseSquare('a1'), 0);
  assert.equal(parseSquare('h8'), 0x77);
  assert.equal(parseSquare('i9'), -1);
  assert.equal(squareName(0x34), 'e4');
});

test('FEN round-trips', () => {
  const fens = [
    START_FEN,
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
    '8/8/8/8/8/5k2/8/R3K3 b Q - 37 61',
  ];
  for (const fen of fens) assert.equal(Position.fromFen(fen).toFen(), fen);
});

test('FEN after 1.e4 sets the en passant square', () => {
  const game = createGame();
  game.moveSan('e4');
  assert.equal(game.fen(), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
});

test('invalid FEN is rejected', () => {
  assert.throws(() => Position.fromFen('not a fen'));
  assert.throws(() => Position.fromFen('8/8/8/8/8/8/8/8 w - - 0 1'), /king/);
  assert.throws(() => Position.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1'));
  assert.throws(() => Position.fromFen('rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
});

test('make/unmake restores every position', () => {
  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  const pos = Position.fromFen(fen);
  for (const move of pos.legalMoves()) {
    pos.makeMove(move);
    pos.undoMove();
    assert.equal(pos.toFen(), fen);
  }
  assert.equal(pos.undoMove(), null);
});

test("fool's mate is checkmate", () => {
  const game = createGame();
  playAll(game, ['f3', 'e5', 'g4', 'Qh4#']);
  const status = game.status();
  assert.equal(status.state, 'checkmate');
  assert.equal(status.winner, 'b');
  assert.equal(status.result, '0-1');
  assert.equal(game.history().at(-1), 'Qh4#');
  assert.equal(game.move({ from: 'a2', to: 'a3' }), null, 'no moves after mate');
});

test('stalemate is a draw', () => {
  for (const fen of ['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'k7/8/1Q6/8/8/8/8/7K b - - 0 1']) {
    const status = createGame({ fen }).status();
    assert.equal(status.state, 'stalemate');
    assert.equal(status.reason, 'stalemate');
    assert.equal(status.result, '1/2-1/2');
    assert.equal(status.check, false);
  }
});

test('threefold repetition by knight shuffling', () => {
  const game = createGame();
  const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  playAll(game, [...shuffle, ...shuffle.slice(0, 3)]);
  assert.equal(game.status().state, 'playing');
  playAll(game, ['Ng8']);
  assert.deepEqual(game.status(), { state: 'draw', reason: 'threefold', winner: null, result: '1/2-1/2', check: false });
  game.undo();
  assert.equal(game.status().state, 'playing', 'undo forgets the repetition');
});

test('fifty-move rule', () => {
  const game = createGame({ fen: '4k3/8/8/8/8/8/4P3/R3K3 w - - 99 60' });
  assert.equal(game.status().state, 'playing');
  game.moveSan('Ra2');
  assert.equal(game.status().reason, 'fifty-move');
  const reset = createGame({ fen: '4k3/8/8/8/8/8/4P3/R3K3 w - - 99 60' });
  reset.moveSan('e3');
  assert.equal(reset.status().state, 'playing', 'a pawn move resets the clock');
  assert.ok(reset.fen().endsWith(' 0 60'));
});

test('insufficient material', () => {
  const draws = [
    '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    '4k3/8/8/8/8/2N5/8/4K3 w - - 0 1',
    '4k3/8/8/8/8/8/6b1/4K3 w - - 0 1',
    '4k3/8/8/8/8/2B5/8/4K1b1 w - - 0 1',
  ];
  for (const fen of draws) assert.equal(createGame({ fen }).status().reason, 'insufficient-material', fen);
  const playable = [
    '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
    '4k3/8/8/8/8/2B5/8/4K2b w - - 0 1',
    '4k3/8/8/8/8/2N5/8/3NK3 w - - 0 1',
    '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
  ];
  for (const fen of playable) assert.equal(createGame({ fen }).status().state, 'playing', fen);
});

test('castling is allowed only when legal', () => {
  const free = sanList('1r2k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(free.includes('e1g1') && free.includes('e1c1'), 'b1 under attack does not stop O-O-O');
  const through = sanList('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!through.includes('e1g1') && through.includes('e1c1'), 'no castling through check');
  const into = sanList('4k1r1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!into.includes('e1g1'), 'no castling into check');
  const outOf = sanList('4k3/4r3/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!outOf.includes('e1g1') && !outOf.includes('e1c1'), 'no castling out of check');
  const noRights = sanList('4k3/8/8/8/8/8/8/R3K2R w - - 0 1');
  assert.ok(!noRights.includes('e1g1'));
});

test('castling moves the rook and rook moves lose rights', () => {
  const game = createGame({ fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' });
  assert.equal(game.moveSan('O-O').san, 'O-O');
  assert.equal(game.fen(), 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
  game.moveSan('Rb8');
  assert.equal(game.fen(), '1r2k2r/8/8/8/8/8/8/R4RK1 w k - 2 2');
});

test('en passant capture and undo', () => {
  const fen = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
  const game = createGame({ fen });
  const record = game.move({ from: 'e5', to: 'f6' });
  assert.equal(record.san, 'exf6');
  assert.equal(record.capture, true);
  assert.equal(game.pieceAt('f5'), null);
  assert.deepEqual(game.pieceAt('f6'), { color: 'w', type: 'p' });
  game.undo();
  assert.equal(game.fen(), fen);
});

test('en passant is illegal when it exposes the king', () => {
  const moves = sanList('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');
  assert.ok(!moves.includes('e5d6'));
});

test('promotion offers four pieces', () => {
  const game = createGame({ fen: '8/P7/8/8/8/8/8/k6K w - - 0 1' });
  assert.equal(game.isPromotion('a7', 'a8'), true);
  assert.equal(game.isPromotion('h1', 'h2'), false);
  const promotions = game.moves('a7').map((m) => m.promotion).sort();
  assert.deepEqual(promotions, ['b', 'n', 'q', 'r']);
  assert.equal(game.move({ from: 'a7', to: 'a8', promotion: 'n' }).san, 'a8=N');
  assert.deepEqual(game.pieceAt('a8'), { color: 'w', type: 'n' });
  game.undo();
  assert.equal(game.move({ from: 'a7', to: 'a8' }).san, 'a8=Q+', 'queen is the default');
});

test('illegal moves are refused', () => {
  const game = createGame();
  assert.equal(game.move({ from: 'e2', to: 'e5' }), null);
  assert.equal(game.move({ from: 'e7', to: 'e5' }), null);
  assert.equal(game.move({ from: 'zz', to: 'e4' }), null);
  assert.equal(game.moveSan('Ke2'), null);
  assert.equal(game.history().length, 0);
});
