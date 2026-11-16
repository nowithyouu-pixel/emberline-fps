// Seeded RNG: every deterministic path in the game (bot choices, spread, shot mode)
// draws from one of these, never from Math.random, so a seeded run replays exactly.
export function mulberry32(initial) {
  let a = initial >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    pick(array) { return array[Math.floor(next() * array.length)]; },
    chance(p) { return next() < p; },
    // Box-Muller pair, cached second value: aim error and recoil jitter.
    gauss() {
      if (this._spare !== undefined) {
        const v = this._spare;
        this._spare = undefined;
        return v;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      v = next();
      const mag = Math.sqrt(-2.0 * Math.log(u));
      this._spare = mag * Math.sin(2.0 * Math.PI * v);
      return mag * Math.cos(2.0 * Math.PI * v);
    },
  };
}
