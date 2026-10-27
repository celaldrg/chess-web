/**
 * Game controller: a position plus history, SAN move list, draw detection,
 * undo and PGN export. Uses algebraic squares ("e4") so a UI can drive it.
 * Pure module, no DOM.
 */
import {
  FLAG,
  Position,
  START_FEN,
  TYPE_CHARS,
  parseSquare,
  pieceColor,
  pieceType,
  squareName,
  toPlainMove,
} from './position.js';
import { moveToSan, sanToMove } from './san.js';
import { buildPgn } from './pgn.js';

/** Moves of the ?demo position: an Italian opening, ten moves deep. */
export const DEMO_MOVES = Object.freeze([
  'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6',
  'O-O', 'O-O', 'Re1', 'a6', 'Bb3', 'Ba7', 'h3', 'h6', 'Nbd2', 'Re8',
]);

const COLOR_CHARS = ['w', 'b'];
const FIFTY_MOVE_PLIES = 100;
const REPETITION_LIMIT = 3;

/**
 * @typedef {object} PieceInfo
 * @property {'w'|'b'} color
 * @property {'p'|'n'|'b'|'r'|'q'|'k'} type
 */

/**
 * @typedef {object} PlainMove
 * @property {string} from
 * @property {string} to
 * @property {string} [promotion] 'q' | 'r' | 'b' | 'n'
 * @property {boolean} capture
 */

/**
 * @typedef {object} GameStatus
 * @property {'playing'|'checkmate'|'stalemate'|'draw'} state
 * @property {null|'stalemate'|'threefold'|'fifty-move'|'insufficient-material'} reason
 * @property {null|'w'|'b'} winner
 * @property {'*'|'1-0'|'0-1'|'1/2-1/2'} result
 * @property {boolean} check side to move is in check
 */

function describePiece(piece) {
  return piece ? { color: COLOR_CHARS[pieceColor(piece)], type: TYPE_CHARS[pieceType(piece)] } : null;
}

function publicMove(move) {
  return { ...toPlainMove(move), capture: Boolean(move.flags & FLAG.CAPTURE) };
}

/** A chess game with history. Create one with createGame(). */
export class Game {
  /** @param {string} [fen] starting position */
  constructor(fen = START_FEN) {
    this.pos = Position.fromFen(fen);
    this.startFen = this.pos.toFen();
    this.records = [];
    this.keys = [];
    this.keyCounts = new Map();
    this.legalCache = null;
    this.pushKey();
  }

  /** @returns {string} current FEN */
  fen() {
    return this.pos.toFen();
  }

  /** @returns {'w'|'b'} side to move */
  turn() {
    return COLOR_CHARS[this.pos.turn];
  }

  /**
   * @param {string} square e.g. "e4"
   * @returns {PieceInfo|null}
   */
  pieceAt(square) {
    const sq = parseSquare(square);
    return sq < 0 ? null : describePiece(this.pos.board[sq]);
  }

  /**
   * 8x8 board, row 0 = rank 8, column 0 = file a.
   * @returns {(PieceInfo & {square: string} | null)[][]}
   */
  board() {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      const row = [];
      for (let file = 0; file < 8; file++) {
        const sq = rank * 16 + file;
        const piece = describePiece(this.pos.board[sq]);
        row.push(piece && { square: squareName(sq), ...piece });
      }
      rows.push(row);
    }
    return rows;
  }

  legal() {
    if (!this.legalCache) this.legalCache = this.pos.legalMoves();
    return this.legalCache;
  }

  /**
   * Legal moves, optionally only those starting on one square.
   * @param {string} [fromSquare]
   * @returns {PlainMove[]}
   */
  moves(fromSquare) {
    const from = fromSquare === undefined ? -1 : parseSquare(fromSquare);
    return this.legal()
      .filter((m) => from < 0 || m.from === from)
      .map(publicMove);
  }

  /**
   * True when moving from→to is a legal pawn promotion (UI opens a picker).
   * @param {string} from
   * @param {string} to
   * @returns {boolean}
   */
  isPromotion(from, to) {
    return this.findMoves(from, to).some((m) => m.promotion);
  }

  findMoves(from, to) {
    const a = parseSquare(from);
    const b = parseSquare(to);
    return this.legal().filter((m) => m.from === a && m.to === b);
  }

  /**
   * Plays a move given in squares. Promotion defaults to a queen.
   * @param {{from: string, to: string, promotion?: string}} input
   * @returns {{from: string, to: string, promotion?: string, capture: boolean, san: string}|null}
   *   the played move, or null when it is illegal or the game is over
   */
  move({ from, to, promotion }) {
    if (this.isGameOver()) return null;
    const wanted = TYPE_CHARS.indexOf(String(promotion || 'q').toLowerCase());
    const candidates = this.findMoves(from, to);
    const move = candidates.find((m) => !m.promotion || m.promotion === wanted);
    return move ? this.play(move) : null;
  }

  /**
   * Plays a move given in SAN, e.g. "Nf3" or "O-O".
   * @param {string} san
   * @returns {object|null} like move()
   */
  moveSan(san) {
    if (this.isGameOver()) return null;
    const move = sanToMove(this.pos, san);
    return move ? this.play(move) : null;
  }

  play(move) {
    const san = moveToSan(this.pos, move, this.legal());
    this.pos.makeMove(move);
    const record = { ...publicMove(move), san };
    this.records.push({ move, record });
    this.legalCache = null;
    this.pushKey();
    return record;
  }

  /**
   * Takes back the last move.
   * @returns {object|null} the move taken back, or null at the start
   */
  undo() {
    const last = this.records.pop();
    if (!last) return null;
    this.popKey();
    this.pos.undoMove();
    this.legalCache = null;
    return last.record;
  }

  pushKey() {
    const key = this.pos.repetitionKey();
    this.keys.push(key);
    this.keyCounts.set(key, (this.keyCounts.get(key) || 0) + 1);
  }

  popKey() {
    const key = this.keys.pop();
    const count = this.keyCounts.get(key) - 1;
    if (count) this.keyCounts.set(key, count);
    else this.keyCounts.delete(key);
  }

  /** @returns {string[]} SAN of every move played */
  history() {
    return this.records.map((r) => r.record.san);
  }

  /** @returns {{from: string, to: string}|null} */
  lastMove() {
    const last = this.records[this.records.length - 1];
    return last ? { from: last.record.from, to: last.record.to } : null;
  }

  /** @returns {boolean} side to move is in check */
  inCheck() {
    return this.pos.inCheck();
  }

  /** @returns {GameStatus} */
  status() {
    const check = this.pos.inCheck();
    if (!this.legal().length) {
      if (!check) return drawStatus('stalemate', 'stalemate', check);
      const winner = COLOR_CHARS[1 - this.pos.turn];
      return { state: 'checkmate', reason: null, winner, result: winner === 'w' ? '1-0' : '0-1', check };
    }
    if (this.pos.isInsufficientMaterial()) return drawStatus('draw', 'insufficient-material', check);
    if (this.keyCounts.get(this.keys[this.keys.length - 1]) >= REPETITION_LIMIT) {
      return drawStatus('draw', 'threefold', check);
    }
    if (this.pos.halfmove >= FIFTY_MOVE_PLIES) return drawStatus('draw', 'fifty-move', check);
    return { state: 'playing', reason: null, winner: null, result: '*', check };
  }

  /** @returns {boolean} */
  isGameOver() {
    return this.status().state !== 'playing';
  }

  /**
   * Snapshot for rendering.
   * @returns {object} fen, turn, board, moves, history, lastMove, checkSquare,
   *   moveNumber and every GameStatus field
   */
  getState() {
    const status = this.status();
    const kingSq = this.pos.kings[this.pos.turn];
    return {
      ...status,
      fen: this.fen(),
      turn: this.turn(),
      board: this.board(),
      moves: status.state === 'playing' ? this.moves() : [],
      history: this.history(),
      lastMove: this.lastMove(),
      checkSquare: status.check ? squareName(kingSq) : null,
      moveNumber: this.pos.fullmove,
    };
  }

  /**
   * PGN of the game so far.
   * @param {{white?: string, black?: string, event?: string, date?: Date}} [tags]
   * @returns {string}
   */
  pgn(tags = {}) {
    return buildPgn({ ...tags, moves: this.history(), result: this.status().result, startFen: this.startFen });
  }
}

function drawStatus(state, reason, check) {
  return { state, reason, winner: null, result: '1/2-1/2', check };
}

/**
 * Creates a game.
 * @param {{fen?: string}} [options]
 * @returns {Game}
 */
export function createGame({ fen = START_FEN } = {}) {
  return new Game(fen);
}

/**
 * Builds the deterministic ?demo game (Italian opening, last move highlighted).
 * @returns {Game}
 */
export function createDemoGame() {
  const game = createGame();
  for (const san of DEMO_MOVES) {
    if (!game.moveSan(san)) throw new Error(`Demo move ${san} is illegal`);
  }
  return game;
}
