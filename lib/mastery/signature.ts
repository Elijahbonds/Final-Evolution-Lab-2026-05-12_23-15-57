/**
 * lib/mastery/signature.ts
 * ========================
 * M13 Step 3 — weekly seeded Signature Challenge for the hoops modes.
 *
 * Every ISO week each hoops mode gets ONE deterministic "signature" run: a
 * seeded modifier + target score derived purely from the week key, so every
 * athlete worldwide faces the identical challenge that week (fair leaderboard).
 * Purely a function of the calendar — no per-user state, no RNG at request time.
 * Attempts are capped at 1/day server-side (see the signature route).
 */

export const SIGNATURE_MODES = ['dunkContest', 'threePoint', 'hoops1v1'] as const;
export type SignatureMode = (typeof SIGNATURE_MODES)[number];

export const MODE_LABEL: Record<SignatureMode, string> = {
  dunkContest: 'Dunk Contest',
  threePoint: '3-Point Contest',
  hoops1v1: '1v1 Hoops',
};

const MODIFIERS = [
  { key: 'goldenHour', name: 'Golden Hour', blurb: 'Venice sunset — style points shine brighter.' },
  { key: 'ironNerve', name: 'Iron Nerve', blurb: 'Pressure is on. Clutch finishes count double.' },
  { key: 'quickfire', name: 'Quickfire', blurb: 'Shorter clock — speed over hesitation.' },
  { key: 'perfectionist', name: 'Perfectionist', blurb: 'Only clean, high-quality reps score.' },
  { key: 'showtime', name: 'Showtime', blurb: 'Crowd is electric — flair is rewarded.' },
  { key: 'grinder', name: 'Grinder', blurb: 'Consistency beats highlight-reel risk.' },
];

/** Stable 32-bit hash of a string (FNV-1a). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** ISO-8601 week key for a date, e.g. "2026-W29" (UTC). */
export function isoWeekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface Signature {
  mode: SignatureMode;
  modeLabel: string;
  weekKey: string;
  challengeKey: string; // `${mode}:${weekKey}`
  modifier: { key: string; name: string; blurb: string };
  targetScore: number;
}

/** Base target score per mode (before the seeded jitter). */
const BASE_TARGET: Record<SignatureMode, number> = {
  dunkContest: 80,
  threePoint: 60,
  hoops1v1: 21,
};

/** Deterministically derive this week's signature for one mode. */
export function signatureFor(mode: SignatureMode, weekKey = isoWeekKey()): Signature {
  const challengeKey = `${mode}:${weekKey}`;
  const seed = hash32(challengeKey);
  const modifier = MODIFIERS[seed % MODIFIERS.length];
  // +/- up to ~25% seeded jitter on the base target, rounded to a tidy step.
  const base = BASE_TARGET[mode];
  const jitter = ((seed >>> 8) % 21) - 10; // -10..+10 percent points
  const targetScore = Math.max(1, Math.round((base * (100 + jitter)) / 100));
  return {
    mode,
    modeLabel: MODE_LABEL[mode],
    weekKey,
    challengeKey,
    modifier,
    targetScore,
  };
}

/** All hoops signatures for the current (or given) week. */
export function currentSignatures(weekKey = isoWeekKey()): Signature[] {
  return SIGNATURE_MODES.map((m) => signatureFor(m, weekKey));
}
