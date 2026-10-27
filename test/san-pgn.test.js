import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, parseSquare } from '../src/position.js';
import { moveToSan, sanToMove } from '../src/san.js';
import { buildPgn, formatPgnDate, PGN_SITE } from '../src/pgn.js';
import { createGame } from '../src/game.js';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const DATE = new Date(2026, 9, 27);

function sanOf(fen, from, to, promotion = 0) {
  const pos = Position.fromFen(fen);
  const move = pos
    .legalMoves()
    .find((m) => m.from === parseSquare(from) && m.to === parseSquare(to) && m.promotion === promotion);
  assert.ok(move, `${from}-${to} should be legal`);
  return moveToSan(pos, move);
}

test('SAN of every Kiwipete move is unique and parses back', () => {
  const pos = Position.fromFen(KIWIPETE);
  const legal = pos.legalMoves();
  const sans = legal.map((m) => moveToSan(pos, m, legal));
  assert.equal(new Set(sans).size, legal.length);
  sans.forEach((san, i) => assert.deepEqual(sanToMove(pos, san), legal[i], san));
  assert.ok(sans.includes('O-O') && sans.includes('O-O-O'));
  assert.ok(sans.includes('Nxf7') && sans.includes('dxe6') && sans.includes('Qxf6'));
});

test('SAN disambiguates by file, rank or both', () => {
  const knights = '4k3/8/8/8/8/2N3N1/8/4K3 w - - 0 1';
  assert.equal(sanOf(knights, 'c3', 'e2'), 'Nce2');
  assert.equal(sanOf(knights, 'g3', 'e2'), 'Nge2');
  const rooks = '4k3/8/8/R7/8/8/8/R3K3 w - - 0 1';
  assert.equal(sanOf(rooks, 'a1', 'a3'), 'R1a3');
  assert.equal(sanOf(rooks, 'a5', 'a3'), 'R5a3');
  const queens = '4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1';
  assert.equal(sanOf(queens, 'a1', 'b2'), 'Qa1b2');
  assert.equal(sanOf(queens, 'c1', 'b2'), 'Qcb2');
  assert.equal(sanOf(queens, 'a3', 'b2'), 'Q3b2');
});

test('SAN marks captures, promotions, checks and mates', () => {
  assert.equal(sanOf('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a7', 'a8', 5), 'a8=Q+');
  assert.equal(sanOf('1n6/P7/8/8/8/8/8/k6K w - - 0 1', 'a7', 'b8', 2), 'axb8=N');
  assert.equal(sanOf('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1', 'd8'), 'Rd8#');
  assert.equal(sanOf('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1', 'c1'), 'O-O-O');
});

test('SAN parsing accepts common variants', () => {
  const pos = Position.fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(moveToSan(pos, sanToMove(pos, '0-0')), 'O-O');
  assert.equal(moveToSan(pos, sanToMove(pos, 'Rh8+')), 'Rh8+');
  const promo = Position.fromFen('8/P7/8/8/8/8/8/k6K w - - 0 1');
  assert.equal(sanToMove(promo, 'a8R').promotion, 4);
  assert.equal(sanToMove(promo, 'Qa8'), null);
});

test('SAN + PGN of a short game', () => {
  const game = createGame();
  const sans = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'];
  for (const san of sans) assert.equal(game.moveSan(san).san, san);
  assert.deepEqual(game.history(), sans);
  const pgn = game.pgn({ white: 'Alice', black: 'Bob', date: DATE });
  assert.equal(
    pgn,
    [
      '[Event "Casual game"]',
      `[Site "${PGN_SITE}"]`,
      '[Date "2026.10.27"]',
      '[White "Alice"]',
      '[Black "Bob"]',
      '[Result "1-0"]',
      '',
      '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
      '',
    ].join('\n'),
  );
  assert.equal(PGN_SITE, 'https://celaldrg.github.io/chess-web/');
});

test('PGN from a custom position starts with the right move number', () => {
  const fen = '4k3/8/8/8/8/8/8/R3K3 b Q - 0 12';
  const game = createGame({ fen });
  game.moveSan('Kd7');
  game.moveSan('O-O-O+');
  const pgn = game.pgn({ date: DATE });
  assert.ok(pgn.includes('[SetUp "1"]') && pgn.includes(`[FEN "${fen}"]`));
  assert.ok(pgn.endsWith('\n12... Kd7 13. O-O-O+ *\n'));
});

test('PGN escapes tags and wraps long move text', () => {
  const moves = Array.from({ length: 60 }, (_, i) => (i % 2 ? 'Nf6' : 'Nf3'));
  const pgn = buildPgn({ moves, white: 'A "quoted" name', result: '1/2-1/2', date: DATE });
  assert.ok(pgn.includes('[White "A \\"quoted\\" name"]'));
  const body = pgn.split('\n\n')[1].trim().split('\n');
  assert.ok(body.length > 1);
  for (const line of body) assert.ok(line.length <= 80, line);
  assert.ok(body.at(-1).endsWith('1/2-1/2'));
});

test('PGN dates are zero padded', () => {
  assert.equal(formatPgnDate(new Date(2026, 0, 5)), '2026.01.05');
});
