// Deterministic seeded RNG. No DOM and no model imports.

function normalizeSeed(seed) {
  if (typeof seed === 'string') {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
  const numeric = Number(seed);
  return Number.isFinite(numeric) ? numeric >>> 0 : 0;
}

function createRng(seed) {
  let state = normalizeSeed(seed);

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min, max) {
    return min + Math.floor(next() * (max - min + 1));
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  return { next, int, shuffle };
}
