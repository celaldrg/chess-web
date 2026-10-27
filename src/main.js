/**
 * Page entry point: wires the game, board view, computer opponent, dialogs,
 * buttons, keyboard shortcuts and language toggle together.
 */
import { createDemoGame, createGame } from './game.js';
import { createBoardView, pieceGlyph } from './board-view.js';
import { createAiClient } from './ai-client.js';
import { applyTranslations, normalizeLanguage, otherLanguage, translate } from './i18n.js';
import { load, save } from './storage.js';
import { copyText, downloadText } from './share.js';
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
} from './session.js';

const AI_MIN_DELAY_MS = 350;
const TOAST_MS = 2400;

const $ = (id) => document.getElementById(id);
const isDemo = new URLSearchParams(window.location.search).has('demo');
const initialSettings = isDemo ? { ...DEFAULT_SETTINGS } : sanitizeSettings(load('settings', null));

const app = {
  lang: normalizeLanguage(load('lang', 'en')),
  settings: initialSettings,
  game: isDemo ? createDemoGame() : createGame(),
  orientation: humanSide(initialSettings),
  thinking: false,
  aiToken: 0,
  toastTimer: 0,
  resolvePromotion: null,
};

const t = (key, params) => translate(app.lang, key, params);
const ai = createAiClient();
const view = createBoardView($('board'), { onMove: handleBoardMove });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlayerTurn(state) {
  if (state.state !== 'playing' || app.thinking) return false;
  return app.settings.mode === 'pvp' || state.turn === app.settings.color;
}

function render(slide = null) {
  const state = app.game.getState();
  view.render({
    board: state.board,
    moves: state.moves,
    lastMove: state.lastMove,
    checkSquare: state.checkSquare,
    interactive: isPlayerTurn(state),
    orientation: app.orientation,
    t,
    lang: app.lang,
  }, { slide });
  renderStatus(state);
  renderPlayers(state);
  renderMoveList(state);
  $('undo').disabled = !canUndo(app.settings, state.history.length);
  $('copy-pgn').disabled = state.history.length === 0;
  $('download-pgn').disabled = state.history.length === 0;
}

function renderStatus(state) {
  const box = $('status');
  box.dataset.turn = state.turn;
  box.classList.toggle('over', state.state !== 'playing');
  box.classList.toggle('in-check', state.check && state.state === 'playing');
  $('status-text').textContent = statusText(state, app.settings, app.thinking, t);
}

function playerName(color) {
  const { mode, level } = app.settings;
  if (mode === 'pvp') return t(color === 'w' ? 'white' : 'black');
  return color === app.settings.color ? t('you') : t('computer', { level: t(level) });
}

function renderPlayers(state) {
  for (const color of ['w', 'b']) {
    const row = $(`player-${color}`);
    row.classList.toggle('active', state.state === 'playing' && state.turn === color);
    row.querySelector('.player-name').textContent = playerName(color);
    const computerThinking = app.thinking && app.settings.mode === 'ai' && color !== app.settings.color;
    row.querySelector('.thinking').hidden = !computerThinking;
  }
}

function moveCell(san, isCurrent) {
  const cell = document.createElement('span');
  cell.className = isCurrent ? 'san current' : 'san';
  cell.textContent = san || '';
  return cell;
}

function scrollToLatestMove() {
  const list = $('move-list');
  list.scrollTop = list.scrollHeight;
}

function renderMoveList(state) {
  const list = $('move-list');
  const items = [];
  const last = state.history.length - 1;
  for (let i = 0; i < state.history.length; i += 2) {
    const item = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'move-no';
    number.textContent = `${i / 2 + 1}.`;
    item.append(number, moveCell(state.history[i], i === last), moveCell(state.history[i + 1], i + 1 === last));
    items.push(item);
  }
  if (state.result !== '*') {
    const result = document.createElement('li');
    result.className = 'result';
    result.textContent = state.result;
    items.push(result);
  }
  list.replaceChildren(...items);
  scrollToLatestMove();
  $('moves-empty').hidden = state.history.length > 0;
}

async function handleBoardMove({ from, to, dragged }) {
  let promotion;
  if (app.game.isPromotion(from, to)) {
    promotion = await choosePromotion(app.game.turn());
    if (!promotion) {
      render();
      return;
    }
  }
  playMove({ from, to, promotion }, !dragged);
}

function playMove(move, animate) {
  const record = app.game.move(move);
  render(record && animate ? record : null);
  if (record) maybeStartAi();
}

async function maybeStartAi() {
  if (!isComputerTurn(app.settings, app.game.turn(), !app.game.isGameOver())) return;
  const token = ++app.aiToken;
  app.thinking = true;
  render();
  const started = performance.now();
  const move = await ai.think(app.game.fen(), app.settings.level);
  const rest = AI_MIN_DELAY_MS - (performance.now() - started);
  if (rest > 0) await wait(rest);
  if (token !== app.aiToken) return;
  app.thinking = false;
  if (move) playMove(move, true);
  else render();
}

function cancelAi() {
  app.aiToken += 1;
  app.thinking = false;
  ai.cancel();
}

function startNewGame(settings) {
  cancelAi();
  app.settings = settings;
  save('settings', settings);
  app.game = createGame();
  app.orientation = humanSide(settings);
  view.clearSelection();
  render();
  maybeStartAi();
}

function undo() {
  cancelAi();
  if (canUndo(app.settings, app.game.history().length)) undoMoves(app.game, app.settings);
  view.clearSelection();
  render();
  maybeStartAi();
}

function flipBoard() {
  app.orientation = app.orientation === 'w' ? 'b' : 'w';
  render();
}

function currentPgn() {
  return app.game.pgn({ ...pgnPlayers(app.settings), date: new Date() });
}

async function copyPgn() {
  showToast(t((await copyText(currentPgn())) ? 'copied' : 'copyFailed'));
}

function downloadPgn() {
  downloadText(pgnFilename(new Date()), currentPgn());
}

function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(app.toastTimer);
  app.toastTimer = setTimeout(() => toast.classList.remove('show'), TOAST_MS);
}

/** Settles the open promotion picker: a piece letter, or null when cancelled. */
function settlePromotion(piece) {
  const resolve = app.resolvePromotion;
  app.resolvePromotion = null;
  resolve?.(piece || null);
}

function choosePromotion(color) {
  const dialog = $('promotion-dialog');
  for (const glyph of dialog.querySelectorAll('[data-piece]')) {
    glyph.className = `piece ${color}`;
    glyph.textContent = pieceGlyph(glyph.dataset.piece);
  }
  dialog.showModal();
  return new Promise((resolve) => {
    app.resolvePromotion = resolve;
  });
}

function syncSetupFields() {
  const form = $('setup-form');
  const vsComputer = form.elements.mode.value === 'ai';
  $('color-field').disabled = !vsComputer;
  $('level-field').disabled = !vsComputer;
}

function openSetup() {
  const form = $('setup-form');
  form.elements.mode.value = app.settings.mode;
  form.elements.color.value = app.settings.color;
  form.elements.level.value = app.settings.level;
  syncSetupFields();
  $('setup-dialog').showModal();
}

function submitSetup(event) {
  if (event.submitter?.value !== 'start') return;
  const { elements } = $('setup-form');
  startNewGame(sanitizeSettings({ mode: elements.mode.value, color: elements.color.value, level: elements.level.value }));
}

function applyLanguage() {
  document.documentElement.lang = app.lang;
  document.title = t('title');
  applyTranslations(document, t);
  render();
}

function toggleLanguage() {
  app.lang = otherLanguage(app.lang);
  save('lang', app.lang);
  applyLanguage();
}

const SHORTCUTS = {
  f: flipBoard,
  u: () => !$('undo').disabled && undo(),
  n: openSetup,
};

function onShortcut(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const action = SHORTCUTS[event.key.toLowerCase()];
  if (!action) return;
  event.preventDefault();
  action();
}

$('new-game').addEventListener('click', openSetup);
$('lang').addEventListener('click', toggleLanguage);
$('undo').addEventListener('click', undo);
$('flip').addEventListener('click', flipBoard);
$('copy-pgn').addEventListener('click', copyPgn);
$('download-pgn').addEventListener('click', downloadPgn);
$('setup-form').addEventListener('change', syncSetupFields);
$('setup-form').addEventListener('submit', submitSetup);
$('promotion-form').addEventListener('submit', (event) => settlePromotion(event.submitter?.value));
$('promotion-dialog').addEventListener('close', () => settlePromotion(null));
document.addEventListener('keydown', onShortcut);
new ResizeObserver(() => scrollToLatestMove()).observe($('move-list'));

applyLanguage();
maybeStartAi();
