// THE JUDGES HAVE MORE PERSONALITY THAN THE OPPONENT DOES (2026-09-14).
//
// Five judges, each with their own weights and a bias — Silk scores style at 0.5, Reign carries a −0.4
// grudge. The rival you are actually beating has none of that. `RivalNerve` made him SITUATIONAL, so he
// goes for one when he is behind, but he is not SOMEBODY: no name, no style he prefers, no signature, and
// nothing that changes when you come back tomorrow night.
//
// This is the data half of fixing that. It is deliberately small — five athletes and four numbers each —
// because the interesting behaviour already exists in RivalNerve and the judges; what was missing is that
// every night was against the same anonymous body.
//
// THE ROSTER MAY NOT BREAK THE INVARIANT RivalNerve IS BUILT AROUND:
//
//   A RIVAL THAT SWINGS BIGGER MUST ALSO MISS MORE.
//
// A showman who reaches for harder dunks AND lands them at the same rate as a steady one is not a
// personality, he is a difficulty increase with a name on it — and he makes the steady one strictly worse
// to draw. So `reach` and `risk` move together across the whole roster, and a test asserts the ordering
// holds for every pair. The temperaments differ in WHERE they sit on that line, never in whether they
// obey it.
//
// Pure: no Babylon, no randomness of its own. The mode rolls; this says what it is rolling on.

export interface DunkRival {
  id: string;
  name: string;
  /** One line, printed when they are introduced. */
  tag: string;
  /** Multiplier on the difficulty band they attempt. Above 1 reaches for more. */
  reach: number;
  /** Multiplier on their blown-dunk chance. Moves WITH `reach` — that is the invariant. */
  risk: number;
  /** The dunk they are known for — the banner names it when they land their best one. */
  signature: string;
  tint: string;
}

/**
 * Ordered from safest to wildest. That ordering IS the invariant, and the test reads this array directly
 * rather than a hand-written list, so adding a rival out of order fails rather than quietly inverting it.
 */
export const DUNK_RIVALS: readonly DunkRival[] = [
  { id: 'cass',  name: 'CASS',   tag: 'Never misses. Never amazes.',        reach: 0.86, risk: 0.70, signature: 'TOMAHAWK',         tint: '#8fe0a0' },
  { id: 'ty',    name: 'TY',     tag: 'Power. All night, every night.',      reach: 0.94, risk: 0.86, signature: 'WINDMILL',         tint: '#ffd75e' },
  { id: 'pilot', name: 'PILOT',  tag: 'Reads the room, then takes it.',      reach: 1.00, risk: 1.00, signature: '360',              tint: '#22d3ee' },
  { id: 'zo',    name: 'ZO',     tag: 'Here for the highlight, not the win.', reach: 1.12, risk: 1.22, signature: 'EASTBAY',          tint: '#ff7b54' },
  { id: 'stack', name: 'STACK',  tag: 'Goes for the impossible one first.',  reach: 1.24, risk: 1.45, signature: 'BETWEEN THE LEGS', tint: '#ff006e' },
] as const;

export const DEFAULT_RIVAL: DunkRival = DUNK_RIVALS[2];

/**
 * Who you are facing on night `n`.
 *
 * Walks the roster rather than rolling, so a player who keeps going meets somebody new each night instead
 * of drawing the same name twice in a row by luck — the whole point is that coming back is different.
 * Night numbers are 1-based; anything below that is night one.
 */
export function rivalForNight(n: number): DunkRival {
  if (!Number.isFinite(n)) return DUNK_RIVALS[0];
  const i = Math.max(0, Math.round(n) - 1) % DUNK_RIVALS.length;
  return DUNK_RIVALS[i];
}

export function rivalById(id: string): DunkRival {
  return DUNK_RIVALS.find((r) => r.id === id) ?? DEFAULT_RIVAL;
}

/** The introduction line, so no surface invents its own phrasing for somebody's name. */
export function rivalIntro(r: DunkRival): string {
  return `${r.name} — ${r.tag}`;
}

/** Did this attempt land the dunk they are known for? Drives the banner, not the score. */
export function hitSignature(r: DunkRival, label: string): boolean {
  return !!label && label.toUpperCase() === r.signature;
}
