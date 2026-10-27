/**
 * Tiny localStorage wrapper. Every access is guarded so private mode,
 * blocked storage or a missing localStorage never crash the game.
 */

const PREFIX = 'chess-web:';

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Reads a JSON value.
 * @template T
 * @param {string} key
 * @param {T} fallback returned when nothing (valid) is stored
 * @returns {T}
 */
export function load(key, fallback) {
  try {
    const raw = store()?.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Writes a JSON value.
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean} true when it was saved
 */
export function save(key, value) {
  try {
    const target = store();
    if (!target) return false;
    target.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
