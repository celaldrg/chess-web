/**
 * Small seeded pseudo-random generator (mulberry32). Pure module.
 */

/**
 * Creates a deterministic random function.
 * @param {number} seed any 32-bit integer
 * @returns {() => number} returns floats in [0, 1)
 */
export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
