import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { STRINGS, applyTranslations, normalizeLanguage, otherLanguage, translate } from '../src/i18n.js';
import { load, save } from '../src/storage.js';
import { displayCell, pieceGlyph, squareAt } from '../src/board-view.js';
import {
  DEFAULT_SETTINGS,
  canUndo,
  humanSide,
  isComputerTurn,
  pgnFilename,
  pgnPlayers,
  sanitizeSettings,
  statusText,
  undoMoves,
} from '../src/session.js';

const t = (key, params) => translate('en', key, params);

function withStorage(storage, fn) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...storage });
  try {
    fn();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test('English and Turkish have exactly the same keys and no empty strings', () => {
  assert.deepEqual(Object.keys(STRINGS.tr).sort(), Object.keys(STRINGS.en).sort());
  for (const lang of ['en', 'tr']) {
    for (const [key, value] of Object.entries(STRINGS[lang])) assert.ok(value.trim(), `${lang}.${key} is empty`);
  }
});

test('translate fills placeholders and falls back safely', () => {
  assert.equal(translate('en', 'computer', { level: 'Hard' }), 'Computer · Hard');
  assert.equal(translate('tr', 'computer', { level: 'Zor' }), 'Bilgisayar · Zor');
  assert.equal(translate('xx', 'undo'), 'Undo');
  assert.equal(translate('en', 'no-such-key'), 'no-such-key');
  assert.equal(normalizeLanguage('de'), 'en');
  assert.equal(otherLanguage('en'), 'tr');
  assert.equal(otherLanguage('tr'), 'en');
});

test('applyTranslations fills text, aria-label and title', () => {
  const text = { dataset: { i18n: 'undo' }, textContent: '' };
  const attrs = {};
  const aria = { dataset: { i18nAria: 'boardLabel' }, setAttribute: (name, value) => (attrs[name] = value) };
  const titled = { dataset: { i18nTitle: 'langSwitch' }, title: '' };
  const root = {
    querySelectorAll: (selector) => ({ '[data-i18n]': [text], '[data-i18n-aria]': [aria], '[data-i18n-title]': [titled] })[selector],
  };
  applyTranslations(root, (key) => translate('tr', key));
  assert.equal(text.textContent, 'Geri al');
  assert.equal(attrs['aria-label'], 'Satranç tahtası');
  assert.equal(titled.title, 'EN – İngilizceye geç');
});

test('storage round-trips JSON and never throws', () => {
  withStorage({ value: memoryStorage() }, () => {
    assert.equal(save('lang', 'tr'), true);
    assert.equal(load('lang', 'en'), 'tr');
    assert.equal(load('missing', 42), 42);
  });
  withStorage({ get() { throw new Error('blocked'); } }, () => {
    assert.equal(save('lang', 'tr'), false);
    assert.equal(load('lang', 'en'), 'en');
  });
  const broken = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
  withStorage({ value: broken }, () => {
    assert.equal(load('settings', null), null);
    assert.equal(save('settings', {}), false);
  });
});

test('board geometry maps squares for both orientations', () => {
  assert.equal(squareAt(0, 0, 'w'), 'a8');
  assert.equal(squareAt(7, 7, 'w'), 'h1');
  assert.equal(squareAt(0, 0, 'b'), 'h1');
  assert.equal(squareAt(7, 7, 'b'), 'a8');
  for (const orientation of ['w', 'b']) {
    for (const square of ['a1', 'e4', 'h8', 'c7']) {
      const { row, col } = displayCell(square, orientation);
      assert.equal(squareAt(row, col, orientation), square);
    }
  }
  assert.equal(pieceGlyph('k'), '♚︎');
  assert.equal(pieceGlyph('p'), '♟︎');
});

test('settings are sanitized and decide who moves', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings({ mode: 'pvp', color: 'x', level: 'hard' }), { mode: 'pvp', color: 'w', level: 'hard' });
  assert.equal(humanSide({ mode: 'ai', color: 'b' }), 'b');
  assert.equal(humanSide({ mode: 'pvp', color: 'b' }), 'w');
  assert.equal(isComputerTurn({ mode: 'ai', color: 'w' }, 'b', true), true);
  assert.equal(isComputerTurn({ mode: 'ai', color: 'w' }, 'w', true), false);
  assert.equal(isComputerTurn({ mode: 'ai', color: 'w' }, 'b', false), false);
  assert.equal(isComputerTurn({ mode: 'pvp', color: 'w' }, 'b', true), false);
});

test('undo against the computer takes back the full move pair', () => {
  const vsComputer = { mode: 'ai', color: 'w' };
  const game = createGame();
  for (const san of ['e4', 'e5', 'Nf3', 'Nc6']) game.moveSan(san);
  assert.equal(undoMoves(game, vsComputer), 2);
  assert.deepEqual(game.history(), ['e4', 'e5']);
  game.moveSan('Nf3');
  assert.equal(undoMoves(game, vsComputer), 1, 'computer still thinking: only the player move');
  assert.equal(game.turn(), 'w');

  const asBlack = { mode: 'ai', color: 'b' };
  assert.equal(canUndo(asBlack, 1), false);
  assert.equal(canUndo(asBlack, 2), true);
  assert.equal(canUndo(vsComputer, 1), true);
  assert.equal(undoMoves(game, { mode: 'pvp', color: 'w' }), 1);
  assert.deepEqual(game.history(), ['e4']);
});

test('status text covers turn, check, mate, stalemate and draws', () => {
  const pvp = { mode: 'pvp', color: 'w' };
  const ai = { mode: 'ai', color: 'w' };
  const playing = { state: 'playing', reason: null, winner: null, check: false, turn: 'w' };
  assert.equal(statusText(playing, pvp, false, t), 'White to move');
  assert.equal(statusText({ ...playing, turn: 'b', check: true }, pvp, false, t), 'Black to move · Check!');
  assert.equal(statusText(playing, ai, false, t), 'Your move');
  assert.equal(statusText({ ...playing, turn: 'b' }, ai, true, t), 'Computer is thinking…');
  assert.equal(statusText({ ...playing, state: 'checkmate', winner: 'b' }, pvp, false, t), 'Checkmate · Black wins');
  assert.equal(statusText({ ...playing, state: 'stalemate', reason: 'stalemate' }, pvp, false, t), 'Stalemate · Draw');
  assert.equal(statusText({ ...playing, state: 'draw', reason: 'threefold' }, pvp, false, t), 'Draw by threefold repetition');
  assert.equal(statusText({ ...playing, state: 'draw', reason: 'fifty-move' }, pvp, false, t), 'Draw by the fifty-move rule');
  assert.equal(statusText({ ...playing, state: 'draw', reason: 'insufficient-material' }, pvp, false, t), 'Draw by insufficient material');
});

test('PGN player names and file name', () => {
  assert.deepEqual(pgnPlayers({ mode: 'pvp', color: 'w', level: 'easy' }), { white: 'White', black: 'Black' });
  assert.deepEqual(pgnPlayers({ mode: 'ai', color: 'b', level: 'hard' }), { white: 'Computer (hard)', black: 'Player' });
  assert.equal(pgnFilename(new Date(2026, 9, 7, 9, 5)), 'chess-20261007-0905.pgn');
});
