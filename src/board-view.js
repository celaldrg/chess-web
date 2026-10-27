/**
 * Chessboard view: 64 DOM squares with Unicode pieces, click-to-move and
 * drag (pointer events), and keyboard play. It knows no chess rules; each
 * render() gets the legal moves and reports the chosen one through onMove.
 * Importing this module touches no DOM.
 */

const GLYPHS = Object.freeze({ k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' });
const TEXT_PRESENTATION = '︎';
const FILES = 'abcdefgh';
const PIECE_KEYS = Object.freeze({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' });
const DRAG_THRESHOLD_PX = 6;
const SLIDE_MS = 180;
const KEY_STEPS = Object.freeze({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] });

/**
 * Filled chess glyph for a piece type, forced to text (not emoji) style.
 * @param {'p'|'n'|'b'|'r'|'q'|'k'} type
 * @returns {string}
 */
export function pieceGlyph(type) {
  return GLYPHS[type] + TEXT_PRESENTATION;
}

/**
 * Square shown at a display cell.
 * @param {number} row 0 = top row on screen
 * @param {number} col 0 = left column on screen
 * @param {'w'|'b'} orientation colour at the bottom
 * @returns {string} e.g. "e4"
 */
export function squareAt(row, col, orientation) {
  const file = orientation === 'w' ? col : 7 - col;
  const rank = orientation === 'w' ? 7 - row : row;
  return FILES[file] + (rank + 1);
}

/**
 * Display cell of a square (inverse of squareAt).
 * @param {string} square
 * @param {'w'|'b'} orientation
 * @returns {{row: number, col: number}}
 */
export function displayCell(square, orientation) {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return orientation === 'w' ? { row: 7 - rank, col: file } : { row: rank, col: 7 - file };
}

function isLightSquare(square) {
  return (FILES.indexOf(square[0]) + Number(square[1])) % 2 === 0;
}

function pieceMap(board) {
  const map = new Map();
  for (const row of board) for (const piece of row) if (piece) map.set(piece.square, piece);
  return map;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @typedef {object} BoardState
 * @property {({square: string, color: 'w'|'b', type: string}|null)[][]} board rank 8 first
 * @property {{from: string, to: string, capture: boolean}[]} moves legal moves
 * @property {{from: string, to: string}|null} lastMove
 * @property {string|null} checkSquare
 * @property {boolean} interactive the player may move now
 * @property {'w'|'b'} orientation colour at the bottom
 * @property {(key: string, params?: object) => string} t translator
 * @property {string} lang
 */

/**
 * Builds the board inside `root` (an element with role="grid").
 * @param {HTMLElement} root
 * @param {{onMove: (move: {from: string, to: string, dragged: boolean}) => void}} handlers
 * @returns {{render: (state: BoardState, options?: {slide?: {from: string, to: string}|null}) => void, clearSelection: () => void}}
 */
export function createBoardView(root, { onMove }) {
  const cells = [];
  /** @type {BoardState|null} */
  let state = null;
  let pieces = new Map();
  let selected = null;
  let cursor = null;
  let drag = null;
  let ghost = null;

  buildCells();
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', cancelDrag);
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('focus', () => {
    cursor = cursor || selected || (state?.orientation === 'b' ? 'e7' : 'e2');
    paint();
  });

  function buildCells() {
    for (let row = 0; row < 8; row++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'board-row';
      rowEl.setAttribute('role', 'row');
      for (let col = 0; col < 8; col++) {
        const el = document.createElement('div');
        el.id = `sq-${row}-${col}`;
        el.setAttribute('role', 'gridcell');
        const rank = document.createElement('span');
        rank.className = 'coord coord-rank';
        const file = document.createElement('span');
        file.className = 'coord coord-file';
        const piece = document.createElement('span');
        el.append(rank, file, piece);
        rowEl.append(el);
        cells.push({ el, rank, file, piece, row, col });
      }
      root.append(rowEl);
    }
  }

  function cellOf(square) {
    const { row, col } = displayCell(square, state.orientation);
    return cells[row * 8 + col];
  }

  function canMoveFrom(square) {
    return state.interactive && state.moves.some((m) => m.from === square);
  }

  function targetsOf(square) {
    const targets = new Map();
    if (square) for (const m of state.moves) if (m.from === square) targets.set(m.to, m.capture);
    return targets;
  }

  function isTarget(square) {
    return Boolean(selected) && targetsOf(selected).has(square);
  }

  function describe(square, piece) {
    if (!piece) return state.t('squareEmpty', { square });
    const lower = (key) => state.t(key).toLocaleLowerCase(state.lang);
    return state.t('squarePiece', { square, color: lower(piece.color === 'w' ? 'white' : 'black'), piece: lower(PIECE_KEYS[piece.type]) });
  }

  function squareClasses(square, targets) {
    const classes = ['sq', isLightSquare(square) ? 'light' : 'dark'];
    const last = state.lastMove;
    if (last && (last.from === square || last.to === square)) classes.push('last');
    if (square === selected) classes.push('selected');
    if (targets.has(square)) classes.push(targets.get(square) ? 'capture-target' : 'target');
    if (square === state.checkSquare) classes.push('check');
    if (square === cursor) classes.push('cursor');
    if (canMoveFrom(square)) classes.push('movable');
    if (drag?.active && drag.from === square) classes.push('drag-origin');
    return classes.join(' ');
  }

  function paint() {
    if (!state) return;
    const targets = targetsOf(selected);
    for (const cell of cells) {
      const square = squareAt(cell.row, cell.col, state.orientation);
      const piece = pieces.get(square);
      cell.el.className = squareClasses(square, targets);
      cell.el.setAttribute('aria-label', describe(square, piece));
      cell.el.setAttribute('aria-selected', String(square === selected));
      cell.piece.className = piece ? `piece ${piece.color}` : 'piece';
      cell.piece.textContent = piece ? pieceGlyph(piece.type) : '';
      cell.rank.textContent = cell.col === 0 ? square[1] : '';
      cell.file.textContent = cell.row === 7 ? square[0] : '';
    }
    root.classList.toggle('locked', !state.interactive);
    if (cursor) root.setAttribute('aria-activedescendant', cellOf(cursor).el.id);
  }

  function slide({ from, to }) {
    if (prefersReducedMotion()) return;
    const start = cellOf(from).el.getBoundingClientRect();
    const end = cellOf(to).el.getBoundingClientRect();
    const piece = cellOf(to).piece;
    piece.classList.add('sliding');
    piece.style.transform = `translate(${start.left - end.left}px, ${start.top - end.top}px)`;
    piece.getBoundingClientRect();
    piece.style.transition = `transform ${SLIDE_MS}ms ease-out`;
    piece.style.transform = '';
    piece.addEventListener('transitionend', () => {
      piece.classList.remove('sliding');
      piece.style.transition = '';
    }, { once: true });
  }

  function commit(from, to, dragged) {
    selected = null;
    onMove({ from, to, dragged });
  }

  function squareFromPoint(x, y) {
    const rect = root.getBoundingClientRect();
    const col = Math.floor(((x - rect.left) / rect.width) * 8);
    const row = Math.floor(((y - rect.top) / rect.height) * 8);
    if (row < 0 || row > 7 || col < 0 || col > 7) return null;
    return squareAt(row, col, state.orientation);
  }

  function onPointerDown(event) {
    if (!state || event.button !== 0) return;
    const square = squareFromPoint(event.clientX, event.clientY);
    if (!square) return;
    event.preventDefault();
    root.classList.remove('kbd');
    root.focus({ preventScroll: true });
    cursor = square;
    if (selected && isTarget(square)) {
      commit(selected, square, false);
      return;
    }
    if (canMoveFrom(square)) {
      drag = { from: square, x: event.clientX, y: event.clientY, id: event.pointerId, wasSelected: selected === square, active: false };
      selected = square;
      root.setPointerCapture(event.pointerId);
    } else {
      selected = null;
    }
    paint();
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      showGhost(pieces.get(drag.from));
      paint();
    }
    moveGhost(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const { from, active, wasSelected } = drag;
    drag = null;
    hideGhost();
    const square = squareFromPoint(event.clientX, event.clientY);
    if (active && square && square !== from && isTarget(square)) {
      commit(from, square, true);
      return;
    }
    if (!active && wasSelected) selected = null;
    paint();
  }

  function cancelDrag() {
    drag = null;
    hideGhost();
    paint();
  }

  function showGhost(piece) {
    ghost = document.createElement('span');
    ghost.className = `piece ghost ${piece.color}`;
    ghost.textContent = pieceGlyph(piece.type);
    ghost.setAttribute('aria-hidden', 'true');
    document.body.append(ghost);
  }

  function moveGhost(x, y) {
    const half = root.getBoundingClientRect().width / 16;
    ghost.style.transform = `translate(${x - half}px, ${y - half}px)`;
  }

  function hideGhost() {
    ghost?.remove();
    ghost = null;
  }

  function onKeyDown(event) {
    if (!state) return;
    const step = KEY_STEPS[event.key];
    if (step) moveCursor(step);
    else if (event.key === 'Enter' || event.key === ' ') activate(cursor);
    else if (event.key === 'Escape' && selected) selected = null;
    else return;
    event.preventDefault();
    root.classList.add('kbd');
    paint();
  }

  function moveCursor([dRow, dCol]) {
    const clamp = (n) => Math.min(7, Math.max(0, n));
    const { row, col } = displayCell(cursor || 'e2', state.orientation);
    cursor = squareAt(clamp(row + dRow), clamp(col + dCol), state.orientation);
  }

  function activate(square) {
    if (!square || !state.interactive) return;
    if (selected && isTarget(square)) commit(selected, square, false);
    else selected = canMoveFrom(square) && selected !== square ? square : null;
  }

  /**
   * Draws a new state. `slide` animates the piece that just moved.
   * @param {BoardState} next
   * @param {{slide?: {from: string, to: string}|null}} [options]
   */
  function render(next, { slide: moved = null } = {}) {
    state = next;
    pieces = pieceMap(state.board);
    if (selected && !canMoveFrom(selected)) selected = null;
    paint();
    if (moved) slide(moved);
  }

  /** Forgets the selected piece (new game, undo). */
  function clearSelection() {
    selected = null;
  }

  return { render, clearSelection };
}
