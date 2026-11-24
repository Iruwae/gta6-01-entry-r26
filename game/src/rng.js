// r26 — seeded random helpers (mulberry32, forked per system).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function fork(seed, label) { return mulberry32((seed ^ hashSeed(label)) >>> 0); }
export function range(rng, a, b) { return a + (b - a) * rng(); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function chance(rng, p) { return rng() < p; }
export function rupiah(n) {
  return 'Rp ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function fmtTime(s) { return s.toFixed(1).replace('.', ',') + ' dtk'; }
// Satu seed membangun seluruh kota: tata letak, lalu lintas, dan wajah-wajahnya.
export const GAME_SEED = 20261124;
