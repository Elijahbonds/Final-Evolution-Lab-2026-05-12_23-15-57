// CarnivalNight — the pure rules of a Court Carnival night (A+ mission #3; benchmark Wii Sports Resort floor + Mario
// Party readability). The mode file wires bodies, venues and events; the numbers live here so they are tested.

export const EVENTS_PER_NIGHT = 4;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random `n` of the pool, seeded so two sessions with the same seed see the same night (and tests can pin one). */
export function pickNight<T>(pool: readonly T[], seed: number, n = EVENTS_PER_NIGHT): T[] {
  const out = [...pool];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, Math.min(n, out.length));
}

/** The simulated rival's raw score for an event, drawn inside its plausible range. */
export function rollRival(range: readonly [number, number], rnd: () => number = Math.random): number {
  return range[0] + rnd() * (range[1] - range[0]);
}

/** How much of the rival's final score is on the board at `t` (0..1 of the event). Slow start, a surge in the middle,
 *  the last points land in the final seconds — so the race reads as a race, not a number that appears at the end. */
export function rivalProgress(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);          // smoothstep: 0 at the start, 1 at the end, steepest halfway
}

export type EventWinner = 0 | 1 | -1;
/** Who took the event: 0 the first score, 1 the second, −1 a tie. */
export function eventWinner(a: number, b: number): EventWinner {
  return a > b ? 0 : b > a ? 1 : -1;
}

export interface NightTally {
  points: [number, number];
  won: [string[], string[]];
}

export function freshTally(): NightTally { return { points: [0, 0], won: [[], []] }; }

/** Bank an event: add both scores, hand the event title to its winner (a tie goes to nobody). */
export function bankEvent(t: NightTally, title: string, a: number, b: number): EventWinner {
  t.points[0] += a; t.points[1] += b;
  const w = eventWinner(a, b);
  if (w === 0 || w === 1) t.won[w].push(title);
  return w;
}

/** The champion is the higher total; a tie on points goes to more events won; still tied = the first player (the host of
 *  the night keeps the crown, as before). */
export function nightChampion(t: NightTally): 0 | 1 {
  if (t.points[0] !== t.points[1]) return t.points[0] > t.points[1] ? 0 : 1;
  if (t.won[0].length !== t.won[1].length) return t.won[0].length > t.won[1].length ? 0 : 1;
  return 0;
}

/** Bezel scoreboard rows (HudScoreCard shape). */
export function nightBoard(t: NightTally, names: [string, string]): { name: string; score: number; line: string }[] {
  return [0, 1].map((i) => ({ name: names[i], score: t.points[i], line: t.won[i].length ? t.won[i].join(' · ') : '—' }));
}
