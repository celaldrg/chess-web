import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, START_FEN } from '../src/position.js';

const SUITES = [
  { name: 'start position', fen: START_FEN, counts: [20, 400, 8902, 197281] },
  {
    name: 'Kiwipete',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862],
  },
  { name: 'rook endgame with en passant pins', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', counts: [14, 191, 2812, 43238] },
  {
    name: 'promotions and castling',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467],
  },
  { name: 'underpromotion checks', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', counts: [44, 1486, 62379] },
];

for (const { name, fen, counts } of SUITES) {
  counts.forEach((expected, index) => {
    const depth = index + 1;
    test(`perft ${name} depth ${depth} = ${expected}`, () => {
      const pos = Position.fromFen(fen);
      assert.equal(pos.perft(depth), expected);
      assert.equal(pos.toFen(), fen, 'make/unmake must restore the position');
    });
  });
}
