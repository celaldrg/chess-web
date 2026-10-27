/**
 * Chess position on a 0x88 board: FEN load/save, legal move generation,
 * attack detection and make/unmake. Pure module, no DOM.
 *
 * Square index = rank * 16 + file (a1 = 0, h1 = 7, a8 = 112, h8 = 119).
 * Piece code = (color << 3) | type, 0 = empty square.
 */

export const WHITE = 0;
export const BLACK = 1;

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

/** Bit flags stored on every move. */
export const FLAG = Object.freeze({
  CAPTURE: 1,
  DOUBLE_PUSH: 2,
  EN_PASSANT: 4,
  CASTLE_KING: 8,
  CASTLE_QUEEN: 16,
  PROMOTION: 32,
});

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Lower-case piece letters indexed by piece type. */
export const TYPE_CHARS = ' pnbrqk';

const CASTLE_WHITE_KING = 1;
const CASTLE_WHITE_QUEEN = 2;
const CASTLE_BLACK_KING = 4;
const CASTLE_BLACK_QUEEN = 8;
const CASTLE_CHARS = [
  ['K', CASTLE_WHITE_KING],
  ['Q', CASTLE_WHITE_QUEEN],
  ['k', CASTLE_BLACK_KING],
  ['q', CASTLE_BLACK_QUEEN],
];

const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_DIRS = [-17, -15, 15, 17];
const ROOK_DIRS = [-16, -1, 1, 16];
const KING_DIRS = [...BISHOP_DIRS, ...ROOK_DIRS];
const SLIDER_DIRS = { [BISHOP]: BISHOP_DIRS, [ROOK]: ROOK_DIRS, [QUEEN]: KING_DIRS };
const PROMOTION_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];
const KING_HOME = [0x04, 0x74];

/** Castling rights that survive a move touching each square. */
const CASTLING_MASK = buildCastlingMask();

function buildCastlingMask() {
  const mask = new Uint8Array(128).fill(15);
  mask[0x00] = 15 & ~CASTLE_WHITE_QUEEN;
  mask[0x07] = 15 & ~CASTLE_WHITE_KING;
  mask[0x04] = 15 & ~(CASTLE_WHITE_KING | CASTLE_WHITE_QUEEN);
  mask[0x70] = 15 & ~CASTLE_BLACK_QUEEN;
  mask[0x77] = 15 & ~CASTLE_BLACK_KING;
  mask[0x74] = 15 & ~(CASTLE_BLACK_KING | CASTLE_BLACK_QUEEN);
  return mask;
}

/**
 * Builds a piece code.
 * @param {number} color WHITE or BLACK
 * @param {number} type PAWN..KING
 * @returns {number}
 */
export function makePiece(color, type) {
  return (color << 3) | type;
}

/** @param {number} piece @returns {number} WHITE or BLACK */
export function pieceColor(piece) {
  return piece >> 3;
}

/** @param {number} piece @returns {number} PAWN..KING */
export function pieceType(piece) {
  return piece & 7;
}

/** @param {number} sq 0x88 index @returns {boolean} */
export function isOnBoard(sq) {
  return (sq & 0x88) === 0;
}

/**
 * Converts a 0x88 index to algebraic notation.
 * @param {number} sq
 * @returns {string} e.g. "e4"
 */
export function squareName(sq) {
  return 'abcdefgh'[sq & 7] + ((sq >> 4) + 1);
}

/**
 * Converts algebraic notation to a 0x88 index.
 * @param {string} name e.g. "e4"
 * @returns {number} index, or -1 when the name is not a square
 */
export function parseSquare(name) {
  if (typeof name !== 'string' || !/^[a-h][1-8]$/.test(name)) return -1;
  return (Number(name[1]) - 1) * 16 + (name.charCodeAt(0) - 97);
}

/**
 * Converts an internal move to a plain, serialisable object.
 * @param {Move} move
 * @returns {{from: string, to: string, promotion?: string}}
 */
export function toPlainMove(move) {
  const plain = { from: squareName(move.from), to: squareName(move.to) };
  if (move.promotion) plain.promotion = TYPE_CHARS[move.promotion];
  return plain;
}

/**
 * @typedef {object} Move
 * @property {number} from 0x88 index
 * @property {number} to 0x88 index
 * @property {number} piece moving piece code
 * @property {number} captured captured piece code (0 when none)
 * @property {number} promotion promotion piece type (0 when none)
 * @property {number} flags combination of FLAG bits
 */

function createMove(from, to, piece, captured, flags, promotion = 0) {
  return { from, to, piece, captured, promotion, flags };
}

function pieceChar(piece) {
  const ch = TYPE_CHARS[pieceType(piece)];
  return pieceColor(piece) === WHITE ? ch.toUpperCase() : ch;
}

function parseCount(text, fallback, fen) {
  if (text === undefined) return fallback;
  if (!/^\d+$/.test(text)) throw new Error(`Invalid FEN counter in "${fen}"`);
  return Number(text);
}

/** Mutable chess position with an undo stack. */
export class Position {
  constructor() {
    this.board = new Uint8Array(128);
    this.turn = WHITE;
    this.castling = 0;
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.kings = [-1, -1];
    this.stack = [];
  }

  /**
   * Parses a FEN string.
   * @param {string} fen
   * @returns {Position}
   * @throws {Error} when the FEN is malformed
   */
  static fromFen(fen) {
    const parts = String(fen).trim().split(/\s+/);
    if (parts.length < 4 || parts.length > 6) throw new Error(`Invalid FEN "${fen}"`);
    const pos = new Position();
    pos.readPlacement(parts[0], fen);
    if (parts[1] !== 'w' && parts[1] !== 'b') throw new Error(`Invalid side to move in "${fen}"`);
    pos.turn = parts[1] === 'w' ? WHITE : BLACK;
    pos.castling = readCastling(parts[2], fen);
    pos.ep = parts[3] === '-' ? -1 : parseSquare(parts[3]);
    if (pos.ep === -1 && parts[3] !== '-') throw new Error(`Invalid en passant square in "${fen}"`);
    pos.halfmove = parseCount(parts[4], 0, fen);
    pos.fullmove = Math.max(1, parseCount(parts[5], 1, fen));
    return pos;
  }

  readPlacement(placement, fen) {
    const rows = placement.split('/');
    if (rows.length !== 8) throw new Error(`Invalid FEN placement in "${fen}"`);
    rows.forEach((row, index) => this.readRow(row, 7 - index, fen));
    if (this.kings[WHITE] < 0 || this.kings[BLACK] < 0) {
      throw new Error(`FEN needs one king per side: "${fen}"`);
    }
  }

  readRow(row, rank, fen) {
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      const type = TYPE_CHARS.indexOf(ch.toLowerCase());
      if (type < 1 || file > 7) throw new Error(`Invalid FEN placement in "${fen}"`);
      const color = ch === ch.toLowerCase() ? BLACK : WHITE;
      const sq = rank * 16 + file;
      if (type === KING && this.kings[color] >= 0) throw new Error(`Two kings of one colour in "${fen}"`);
      this.board[sq] = makePiece(color, type);
      if (type === KING) this.kings[color] = sq;
      file += 1;
    }
    if (file !== 8) throw new Error(`Invalid FEN placement in "${fen}"`);
  }

  /** @returns {string} FEN of the current position */
  toFen() {
    return [
      this.placementFen(),
      this.turn === WHITE ? 'w' : 'b',
      castlingFen(this.castling),
      this.ep < 0 ? '-' : squareName(this.ep),
      this.halfmove,
      this.fullmove,
    ].join(' ');
  }

  placementFen() {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[rank * 16 + file];
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) row += empty;
        empty = 0;
        row += pieceChar(piece);
      }
      rows.push(empty ? row + empty : row);
    }
    return rows.join('/');
  }

  /**
   * Key used for repetition detection: placement, side to move, castling
   * rights and the en passant square (only when a capture there is legal).
   * @returns {string}
   */
  repetitionKey() {
    const epCapture = this.ep >= 0 && this.legalMoves().some((m) => m.flags & FLAG.EN_PASSANT);
    return [
      this.placementFen(),
      this.turn === WHITE ? 'w' : 'b',
      castlingFen(this.castling),
      epCapture ? squareName(this.ep) : '-',
    ].join(' ');
  }

  /**
   * True when a piece of colour `by` attacks `sq`.
   * @param {number} sq
   * @param {number} by
   * @returns {boolean}
   */
  isAttacked(sq, by) {
    const board = this.board;
    const pawn = makePiece(by, PAWN);
    const behind = sq + (by === WHITE ? -16 : 16);
    if (isOnBoard(behind - 1) && board[behind - 1] === pawn) return true;
    if (isOnBoard(behind + 1) && board[behind + 1] === pawn) return true;
    if (this.stepAttack(sq, makePiece(by, KNIGHT), KNIGHT_OFFSETS)) return true;
    if (this.stepAttack(sq, makePiece(by, KING), KING_DIRS)) return true;
    return this.slideAttack(sq, by, BISHOP, BISHOP_DIRS) || this.slideAttack(sq, by, ROOK, ROOK_DIRS);
  }

  stepAttack(sq, piece, offsets) {
    for (const offset of offsets) {
      const from = sq + offset;
      if (isOnBoard(from) && this.board[from] === piece) return true;
    }
    return false;
  }

  slideAttack(sq, by, type, dirs) {
    const slider = makePiece(by, type);
    const queen = makePiece(by, QUEEN);
    for (const dir of dirs) {
      for (let from = sq + dir; isOnBoard(from); from += dir) {
        const piece = this.board[from];
        if (!piece) continue;
        if (piece === slider || piece === queen) return true;
        break;
      }
    }
    return false;
  }

  /**
   * True when the king of `color` (default: side to move) is attacked.
   * @param {number} [color]
   * @returns {boolean}
   */
  inCheck(color = this.turn) {
    return this.isAttacked(this.kings[color], 1 - color);
  }

  /**
   * Pseudo-legal moves (may leave the own king in check).
   * @param {boolean} [noisyOnly] only captures and promotions
   * @returns {Move[]}
   */
  pseudoMoves(noisyOnly = false) {
    const moves = [];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const piece = this.board[sq];
      if (piece && pieceColor(piece) === this.turn) this.addPieceMoves(moves, sq, piece, noisyOnly);
    }
    return moves;
  }

  addPieceMoves(moves, sq, piece, noisyOnly) {
    const type = pieceType(piece);
    if (type === PAWN) this.addPawnMoves(moves, sq, piece, noisyOnly);
    else if (type === KNIGHT) this.addStepMoves(moves, sq, piece, KNIGHT_OFFSETS, noisyOnly);
    else if (type === KING) {
      this.addStepMoves(moves, sq, piece, KING_DIRS, noisyOnly);
      if (!noisyOnly) this.addCastlingMoves(moves, sq, piece);
    } else this.addSlideMoves(moves, sq, piece, SLIDER_DIRS[type], noisyOnly);
  }

  addPawnMoves(moves, from, piece, noisyOnly) {
    const us = pieceColor(piece);
    const dir = us === WHITE ? 16 : -16;
    const lastRank = us === WHITE ? 7 : 0;
    const one = from + dir;
    if (!isOnBoard(one)) return;
    if (!this.board[one]) {
      if (one >> 4 === lastRank) addPromotions(moves, from, one, piece, 0, 0);
      else if (!noisyOnly) {
        moves.push(createMove(from, one, piece, 0, 0));
        const two = one + dir;
        if (from >> 4 === (us === WHITE ? 1 : 6) && !this.board[two]) {
          moves.push(createMove(from, two, piece, 0, FLAG.DOUBLE_PUSH));
        }
      }
    }
    this.addPawnCapture(moves, from, one - 1, piece, lastRank);
    this.addPawnCapture(moves, from, one + 1, piece, lastRank);
  }

  addPawnCapture(moves, from, to, piece, lastRank) {
    if (!isOnBoard(to)) return;
    const target = this.board[to];
    const them = 1 - pieceColor(piece);
    if (target && pieceColor(target) === them) {
      if (to >> 4 === lastRank) addPromotions(moves, from, to, piece, target, FLAG.CAPTURE);
      else moves.push(createMove(from, to, piece, target, FLAG.CAPTURE));
      return;
    }
    const victimSq = (from & 0x70) | (to & 7);
    const victim = makePiece(them, PAWN);
    if (!target && to === this.ep && this.board[victimSq] === victim) {
      moves.push(createMove(from, to, piece, victim, FLAG.CAPTURE | FLAG.EN_PASSANT));
    }
  }

  addStepMoves(moves, from, piece, offsets, noisyOnly) {
    for (const offset of offsets) {
      const to = from + offset;
      if (isOnBoard(to)) this.addTarget(moves, from, to, piece, noisyOnly);
    }
  }

  addSlideMoves(moves, from, piece, dirs, noisyOnly) {
    for (const dir of dirs) {
      for (let to = from + dir; isOnBoard(to); to += dir) {
        this.addTarget(moves, from, to, piece, noisyOnly);
        if (this.board[to]) break;
      }
    }
  }

  addTarget(moves, from, to, piece, noisyOnly) {
    const target = this.board[to];
    if (!target) {
      if (!noisyOnly) moves.push(createMove(from, to, piece, 0, 0));
    } else if (pieceColor(target) !== pieceColor(piece)) {
      moves.push(createMove(from, to, piece, target, FLAG.CAPTURE));
    }
  }

  addCastlingMoves(moves, from, piece) {
    const us = pieceColor(piece);
    const them = 1 - us;
    if (from !== KING_HOME[us] || this.isAttacked(from, them)) return;
    const rook = makePiece(us, ROOK);
    const b = this.board;
    const kingSide = us === WHITE ? CASTLE_WHITE_KING : CASTLE_BLACK_KING;
    const queenSide = us === WHITE ? CASTLE_WHITE_QUEEN : CASTLE_BLACK_QUEEN;
    if (
      this.castling & kingSide &&
      !b[from + 1] &&
      !b[from + 2] &&
      b[from + 3] === rook &&
      !this.isAttacked(from + 1, them) &&
      !this.isAttacked(from + 2, them)
    ) {
      moves.push(createMove(from, from + 2, piece, 0, FLAG.CASTLE_KING));
    }
    if (
      this.castling & queenSide &&
      !b[from - 1] &&
      !b[from - 2] &&
      !b[from - 3] &&
      b[from - 4] === rook &&
      !this.isAttacked(from - 1, them) &&
      !this.isAttacked(from - 2, them)
    ) {
      moves.push(createMove(from, from - 2, piece, 0, FLAG.CASTLE_QUEEN));
    }
  }

  /** @returns {Move[]} all legal moves for the side to move */
  legalMoves() {
    return this.pseudoMoves().filter((move) => {
      if (!this.tryMove(move)) return false;
      this.undoMove();
      return true;
    });
  }

  /**
   * Makes a pseudo-legal move if it does not leave the own king in check.
   * @param {Move} move
   * @returns {boolean} true when the move was made (undo it with undoMove)
   */
  tryMove(move) {
    this.makeMove(move);
    if (!this.isAttacked(this.kings[1 - this.turn], this.turn)) return true;
    this.undoMove();
    return false;
  }

  /**
   * Plays a move without legality checks and pushes undo information.
   * @param {Move} move
   */
  makeMove(move) {
    const us = this.turn;
    const { from, to, flags } = move;
    const board = this.board;
    this.stack.push({ move, castling: this.castling, ep: this.ep, halfmove: this.halfmove });
    board[to] = move.promotion ? makePiece(us, move.promotion) : move.piece;
    board[from] = 0;
    if (flags & FLAG.EN_PASSANT) board[(from & 0x70) | (to & 7)] = 0;
    if (flags & FLAG.CASTLE_KING) moveRook(board, to + 1, to - 1);
    if (flags & FLAG.CASTLE_QUEEN) moveRook(board, to - 2, to + 1);
    if (pieceType(move.piece) === KING) this.kings[us] = to;
    this.castling &= CASTLING_MASK[from] & CASTLING_MASK[to];
    this.ep = flags & FLAG.DOUBLE_PUSH ? (from + to) >> 1 : -1;
    this.halfmove = pieceType(move.piece) === PAWN || move.captured ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove += 1;
    this.turn = 1 - us;
  }

  /**
   * Takes back the last move made with makeMove.
   * @returns {Move|null} the move taken back, or null when there is none
   */
  undoMove() {
    const undo = this.stack.pop();
    if (!undo) return null;
    const { move } = undo;
    const { from, to, flags } = move;
    const board = this.board;
    const us = 1 - this.turn;
    this.turn = us;
    board[from] = move.piece;
    board[to] = flags & FLAG.EN_PASSANT ? 0 : move.captured;
    if (flags & FLAG.EN_PASSANT) board[(from & 0x70) | (to & 7)] = move.captured;
    if (flags & FLAG.CASTLE_KING) moveRook(board, to - 1, to + 1);
    if (flags & FLAG.CASTLE_QUEEN) moveRook(board, to + 1, to - 2);
    if (pieceType(move.piece) === KING) this.kings[us] = from;
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    if (us === BLACK) this.fullmove -= 1;
    return move;
  }

  /**
   * True when neither side can possibly deliver mate: K v K, K + minor v K,
   * or only bishops that all stand on squares of one colour.
   * @returns {boolean}
   */
  isInsufficientMaterial() {
    const minors = [];
    for (let sq = 0; sq < 120; sq++) {
      const piece = isOnBoard(sq) ? this.board[sq] : 0;
      const type = pieceType(piece);
      if (!piece || type === KING) continue;
      if (type !== KNIGHT && type !== BISHOP) return false;
      minors.push({ type, shade: ((sq >> 4) + (sq & 7)) % 2 });
    }
    if (minors.length <= 1) return true;
    return minors.every((m) => m.type === BISHOP && m.shade === minors[0].shade);
  }

  /**
   * Counts leaf nodes of the legal move tree (move generator self-test).
   * @param {number} depth
   * @returns {number}
   */
  perft(depth) {
    if (depth === 0) return 1;
    const moves = this.legalMoves();
    if (depth === 1) return moves.length;
    let nodes = 0;
    for (const move of moves) {
      this.makeMove(move);
      nodes += this.perft(depth - 1);
      this.undoMove();
    }
    return nodes;
  }
}

function moveRook(board, from, to) {
  board[to] = board[from];
  board[from] = 0;
}

function addPromotions(moves, from, to, piece, captured, flags) {
  for (const type of PROMOTION_TYPES) {
    moves.push(createMove(from, to, piece, captured, flags | FLAG.PROMOTION, type));
  }
}

function readCastling(text, fen) {
  if (text === '-') return 0;
  let rights = 0;
  for (const ch of text) {
    const entry = CASTLE_CHARS.find(([letter]) => letter === ch);
    if (!entry) throw new Error(`Invalid castling rights in "${fen}"`);
    rights |= entry[1];
  }
  return rights;
}

function castlingFen(rights) {
  const text = CASTLE_CHARS.filter(([, bit]) => rights & bit)
    .map(([letter]) => letter)
    .join('');
  return text || '-';
}
