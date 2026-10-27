/**
 * Session rules shared by the UI: settings, whose turn it is, undo in
 * vs-computer mode, status text and PGN naming. Pure module, no DOM.
 */

export const MODES = Object.freeze(['ai', 'pvp']);
export const COLORS = Object.freeze(['w', 'b']);
export const LEVEL_NAMES = Object.freeze(['easy', 'medium', 'hard']);

/** Settings for a first visit and for ?demo. */
export const DEFAULT_SETTINGS = Object.freeze({ mode: 'ai', color: 'w', level: 'medium' });

const DRAW_KEYS = Object.freeze({
  stalemate: 'stalemate',
  threefold: 'drawThreefold',
  'fifty-move': 'drawFifty',
  'insufficient-material': 'drawMaterial',
});

/**
 * Keeps only valid settings values (stored data may be old or edited).
 * @param {unknown} raw
 * @returns {{mode: 'ai'|'pvp', color: 'w'|'b', level: 'easy'|'medium'|'hard'}}
 */
export function sanitizeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    mode: MODES.includes(value.mode) ? value.mode : DEFAULT_SETTINGS.mode,
    color: COLORS.includes(value.color) ? value.color : DEFAULT_SETTINGS.color,
    level: LEVEL_NAMES.includes(value.level) ? value.level : DEFAULT_SETTINGS.level,
  };
}

/**
 * The colour shown at the bottom of the board for a new game.
 * @param {{mode: string, color: string}} settings
 * @returns {'w'|'b'}
 */
export function humanSide(settings) {
  return settings.mode === 'ai' ? settings.color : 'w';
}

/**
 * True when the computer should move now.
 * @param {{mode: string, color: string}} settings
 * @param {'w'|'b'} turn side to move
 * @param {boolean} playing the game is not over
 * @returns {boolean}
 */
export function isComputerTurn(settings, turn, playing) {
  return playing && settings.mode === 'ai' && turn !== settings.color;
}

/**
 * Whether Undo has something to take back. Against the computer at least
 * one of the player's own moves must exist.
 * @param {{mode: string, color: string}} settings
 * @param {number} plies half-moves played from the start position
 * @returns {boolean}
 */
export function canUndo(settings, plies) {
  const needed = settings.mode === 'ai' && settings.color === 'b' ? 2 : 1;
  return plies >= needed;
}

/**
 * Takes back one move (two players) or the full move pair (vs computer),
 * so it is the player's turn again.
 * @param {{undo: () => object|null, turn: () => 'w'|'b'}} game
 * @param {{mode: string, color: string}} settings
 * @returns {number} half-moves taken back
 */
export function undoMoves(game, settings) {
  if (settings.mode !== 'ai') return game.undo() ? 1 : 0;
  let count = 0;
  while (game.undo()) {
    count += 1;
    if (game.turn() === settings.color) break;
  }
  return count;
}

/**
 * One-line status: turn, check, mate, stalemate or the draw reason.
 * @param {{state: string, reason: string|null, winner: string|null, check: boolean, turn: 'w'|'b'}} status
 * @param {{mode: string, color: string}} settings
 * @param {boolean} thinking the computer is searching
 * @param {(key: string) => string} t translator
 * @returns {string}
 */
export function statusText(status, settings, thinking, t) {
  if (status.state === 'checkmate') return t(status.winner === 'w' ? 'whiteWins' : 'blackWins');
  if (status.state !== 'playing') return t(DRAW_KEYS[status.reason]);
  let text;
  if (settings.mode === 'ai') text = thinking || status.turn !== settings.color ? t('thinking') : t('yourMove');
  else text = t(status.turn === 'w' ? 'whiteToMove' : 'blackToMove');
  return status.check ? `${text} · ${t('check')}` : text;
}

/**
 * Player names for the PGN White/Black tags.
 * @param {{mode: string, color: string, level: string}} settings
 * @returns {{white: string, black: string}}
 */
export function pgnPlayers(settings) {
  if (settings.mode !== 'ai') return { white: 'White', black: 'Black' };
  const computer = `Computer (${settings.level})`;
  return settings.color === 'w' ? { white: 'Player', black: computer } : { white: computer, black: 'Player' };
}

/**
 * File name for a downloaded PGN, e.g. "chess-20261027-1430.pgn".
 * @param {Date} date
 * @returns {string}
 */
export function pgnFilename(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `chess-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.pgn`;
}
