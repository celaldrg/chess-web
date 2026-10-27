/**
 * PGN (Portable Game Notation) export. Pure module.
 */
import { START_FEN } from './position.js';

export const PGN_SITE = 'https://celaldrg.github.io/chess-web/';

const LINE_WIDTH = 80;

/**
 * Formats a date as a PGN date tag value.
 * @param {Date} date
 * @returns {string} "YYYY.MM.DD"
 */
export function formatPgnDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/**
 * Builds a PGN document.
 * @param {object} game
 * @param {string[]} game.moves SAN moves in order
 * @param {string} [game.result] "1-0", "0-1", "1/2-1/2" or "*"
 * @param {string} [game.startFen] FEN of the starting position
 * @param {string} [game.event]
 * @param {string} [game.white]
 * @param {string} [game.black]
 * @param {Date} [game.date]
 * @returns {string}
 */
export function buildPgn({
  moves,
  result = '*',
  startFen = START_FEN,
  event = 'Casual game',
  white = 'White',
  black = 'Black',
  date = new Date(),
}) {
  const headers = [
    ['Event', event],
    ['Site', PGN_SITE],
    ['Date', formatPgnDate(date)],
    ['White', white],
    ['Black', black],
    ['Result', result],
  ];
  if (startFen !== START_FEN) headers.push(['SetUp', '1'], ['FEN', startFen]);
  const tagSection = headers.map(([name, value]) => `[${name} "${escapeTag(value)}"]`).join('\n');
  return `${tagSection}\n\n${wrap(moveTokens(moves, startFen).concat(result))}\n`;
}

function escapeTag(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function moveTokens(moves, startFen) {
  const fields = startFen.split(/\s+/);
  let number = Number(fields[5]) || 1;
  let whiteToMove = fields[1] !== 'b';
  const tokens = [];
  moves.forEach((san, index) => {
    if (whiteToMove) tokens.push(`${number}.`);
    else if (index === 0) tokens.push(`${number}...`);
    tokens.push(san);
    if (!whiteToMove) number += 1;
    whiteToMove = !whiteToMove;
  });
  return tokens;
}

function wrap(tokens) {
  const lines = [];
  let line = '';
  for (const token of tokens) {
    if (line && line.length + 1 + token.length > LINE_WIDTH) {
      lines.push(line);
      line = token;
    } else {
      line = line ? `${line} ${token}` : token;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
