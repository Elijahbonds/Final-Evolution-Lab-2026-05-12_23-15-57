// lib/vbt/rng.ts — VBT (2026-10-25): a small seeded RNG (mulberry32) and a normal draw from it, so the bench, the plate
// detector's RANSAC and the tests read the same numbers on every run. Pure.
export function rng(seed: number): { u: () => number; n: () => number } {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = () => { const x = Math.max(1e-12, u()), y = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * y); };
  return { u, n };
}
