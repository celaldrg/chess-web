/**
 * Static evaluation: material plus piece-square tables. Pure module.
 * Tables are written from White's point of view, rank 8 first.
 */
import { BISHOP, KING, KNIGHT, PAWN, QUEEN, ROOK, WHITE, isOnBoard, pieceColor, pieceType } from './position.js';

/** Centipawn value per piece type (index = type). */
export const PIECE_VALUES = [0, 100, 320, 330, 500, 900, 0];

const ENDGAME_MATERIAL = 1300;
const BISHOP_PAIR_BONUS = 30;

// prettier-ignore
const PAWN_TABLE = [
   0,   0,   0,   0,   0,   0,   0,   0,
  50,  50,  50,  50,  50,  50,  50,  50,
  10,  10,  20,  30,  30,  20,  10,  10,
   5,   5,  10,  25,  25,  10,   5,   5,
   0,   0,   0,  20,  20,   0,   0,   0,
   5,  -5, -10,   0,   0, -10,  -5,   5,
   5,  10,  10, -20, -20,  10,  10,   5,
   0,   0,   0,   0,   0,   0,   0,   0,
];

// prettier-ignore
const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20,   0,   0,   0,   0, -20, -40,
  -30,   0,  10,  15,  15,  10,   0, -30,
  -30,   5,  15,  20,  20,  15,   5, -30,
  -30,   0,  15,  20,  20,  15,   0, -30,
  -30,   5,  10,  15,  15,  10,   5, -30,
  -40, -20,   0,   5,   5,   0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

// prettier-ignore
const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10,   0,   0,   0,   0,   0,   0, -10,
  -10,   0,   5,  10,  10,   5,   0, -10,
  -10,   5,   5,  10,  10,   5,   5, -10,
  -10,   0,  10,  10,  10,  10,   0, -10,
  -10,  10,  10,  10,  10,  10,  10, -10,
  -10,   5,   0,   0,   0,   0,   5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

// prettier-ignore
const ROOK_TABLE = [
   0,   0,   0,   0,   0,   0,   0,   0,
   5,  10,  10,  10,  10,  10,  10,   5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
  -5,   0,   0,   0,   0,   0,   0,  -5,
   0,   0,   0,   5,   5,   0,   0,   0,
];

// prettier-ignore
const QUEEN_TABLE = [
  -20, -10, -10,  -5,  -5, -10, -10, -20,
  -10,   0,   0,   0,   0,   0,   0, -10,
  -10,   0,   5,   5,   5,   5,   0, -10,
   -5,   0,   5,   5,   5,   5,   0,  -5,
    0,   0,   5,   5,   5,   5,   0,  -5,
  -10,   5,   5,   5,   5,   5,   0, -10,
  -10,   0,   5,   0,   0,   0,   0, -10,
  -20, -10, -10,  -5,  -5, -10, -10, -20,
];

// prettier-ignore
const KING_MIDDLE_TABLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
   20,  20,   0,   0,   0,   0,  20,  20,
   20,  30,  10,   0,   0,  10,  30,  20,
];

// prettier-ignore
const KING_END_TABLE = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10,   0,   0, -10, -20, -30,
  -30, -10,  20,  30,  30,  20, -10, -30,
  -30, -10,  30,  40,  40,  30, -10, -30,
  -30, -10,  30,  40,  40,  30, -10, -30,
  -30, -10,  20,  30,  30,  20, -10, -30,
  -30, -30,   0,   0,   0,   0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

const TABLES = {
  [PAWN]: PAWN_TABLE,
  [KNIGHT]: KNIGHT_TABLE,
  [BISHOP]: BISHOP_TABLE,
  [ROOK]: ROOK_TABLE,
  [QUEEN]: QUEEN_TABLE,
};

/** Index into a White-oriented table for a piece of `color` on 0x88 `sq`. */
function tableIndex(sq, color) {
  const rank = sq >> 4;
  return (color === WHITE ? 7 - rank : rank) * 8 + (sq & 7);
}

/**
 * Evaluates a position in centipawns from the side to move's point of view.
 * @param {import('./position.js').Position} pos
 * @returns {number}
 */
export function evaluate(pos) {
  const score = [0, 0];
  const officers = [0, 0];
  const bishops = [0, 0];
  for (let sq = 0; sq < 120; sq++) {
    const piece = isOnBoard(sq) ? pos.board[sq] : 0;
    const type = pieceType(piece);
    if (!piece || type === KING) continue;
    const color = pieceColor(piece);
    score[color] += PIECE_VALUES[type] + TABLES[type][tableIndex(sq, color)];
    if (type !== PAWN) officers[color] += PIECE_VALUES[type];
    if (type === BISHOP) bishops[color] += 1;
  }
  const kingTable = officers[0] + officers[1] <= ENDGAME_MATERIAL * 2 ? KING_END_TABLE : KING_MIDDLE_TABLE;
  for (const color of [0, 1]) {
    score[color] += kingTable[tableIndex(pos.kings[color], color)];
    if (bishops[color] >= 2) score[color] += BISHOP_PAIR_BONUS;
  }
  const whiteView = score[0] - score[1];
  return pos.turn === WHITE ? whiteView : -whiteView;
}
