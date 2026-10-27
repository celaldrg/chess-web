/**
 * Standard Algebraic Notation (SAN): generation and parsing. Pure module.
 */
import { FLAG, PAWN, pieceType, squareName } from './position.js';

const TYPE_LETTERS = ' PNBRQK';

/**
 * SAN of a legal move in the given position, including "+" or "#".
 * @param {import('./position.js').Position} pos position before the move
 * @param {import('./position.js').Move} move a legal move
 * @param {import('./position.js').Move[]} [legal] legal moves of `pos` (saves work)
 * @returns {string}
 */
export function moveToSan(pos, move, legal = pos.legalMoves()) {
  const san = baseSan(move, legal);
  pos.makeMove(move);
  const suffix = pos.inCheck() ? (pos.legalMoves().length ? '+' : '#') : '';
  pos.undoMove();
  return san + suffix;
}

/**
 * Finds the legal move matching a SAN string (check marks and "!?" are ignored,
 * "0-0" and "e8Q" are accepted).
 * @param {import('./position.js').Position} pos
 * @param {string} san
 * @returns {import('./position.js').Move|null}
 */
export function sanToMove(pos, san) {
  const wanted = normalizeSan(san);
  const legal = pos.legalMoves();
  return legal.find((move) => baseSan(move, legal) === wanted) || null;
}

function normalizeSan(san) {
  return String(san)
    .trim()
    .replace(/[+#!?]+$/, '')
    .replace(/0/g, 'O')
    .replace(/^([a-h](?:x[a-h])?[18])([QRBN])$/, '$1=$2');
}

function baseSan(move, legal) {
  if (move.flags & FLAG.CASTLE_KING) return 'O-O';
  if (move.flags & FLAG.CASTLE_QUEEN) return 'O-O-O';
  const type = pieceType(move.piece);
  const capture = move.flags & FLAG.CAPTURE ? 'x' : '';
  const to = squareName(move.to);
  if (type === PAWN) {
    const file = capture ? squareName(move.from)[0] : '';
    const promotion = move.promotion ? `=${TYPE_LETTERS[move.promotion]}` : '';
    return file + capture + to + promotion;
  }
  return TYPE_LETTERS[type] + disambiguation(move, legal) + capture + to;
}

function disambiguation(move, legal) {
  const rivals = legal.filter((m) => m.piece === move.piece && m.to === move.to && m.from !== move.from);
  if (!rivals.length) return '';
  const from = squareName(move.from);
  const sharesFile = rivals.some((m) => (m.from & 7) === (move.from & 7));
  if (!sharesFile) return from[0];
  const sharesRank = rivals.some((m) => m.from >> 4 === move.from >> 4);
  return sharesRank ? from : from[1];
}
