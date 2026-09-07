/**
 * lib/mp/match-core.ts — PURE async-multiplayer match logic.
 *
 * No DB / network / server-only imports — the routes AND the unit tests import
 * this same module (never fork a core). Covers challenge-code generation and
 * winner resolution from two final scores.
 */

// Unambiguous alphabet (no 0/O/1/I) so codes read cleanly aloud / over text.
export const MP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type MpOutcome = 'host' | 'guest' | 'tie';

/** Generate a shareable challenge code. */
export function generateMatchCode(len = 6, rnd: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < len; i++) out += MP_CODE_ALPHABET[Math.floor(rnd() * MP_CODE_ALPHABET.length)];
  return out;
}

/** Is a string a well-formed challenge code? */
export function isValidMatchCode(code: string): boolean {
  return /^[A-Z2-9]{4,10}$/.test((code || '').toUpperCase());
}

/**
 * Resolve the winner from two final scores. Higher score wins; equal is a tie.
 * Pure and total — non-finite inputs are treated as 0 so it can never throw.
 */
export function resolveOutcome(hostScore: number, guestScore: number): MpOutcome {
  const h = Number.isFinite(hostScore) ? hostScore : 0;
  const g = Number.isFinite(guestScore) ? guestScore : 0;
  if (h > g) return 'host';
  if (g > h) return 'guest';
  return 'tie';
}

/** Map an outcome to the winning user id (or null for a tie). */
export function winnerIdFor(outcome: MpOutcome, hostId: string, guestId: string | null): string | null {
  if (outcome === 'host') return hostId;
  if (outcome === 'guest') return guestId;
  return null;
}

/**
 * Curated score-based modes eligible for async challenges (higher score wins).
 * Quiz/co-op modes are intentionally excluded. Labels drive the lobby UI.
 */
export const MP_MODES: { key: string; label: string }[] = [
  { key: 'dunk', label: 'Flight Night' },
  { key: 'threepoint', label: 'Downtown' },
  { key: 'sprint', label: 'Beach Sprint' },
  { key: 'big-air', label: 'Stomp' },
  { key: 'snowboard', label: 'Gate Crasher' },
  { key: 'skateboard', label: 'Venice Lines' },
  { key: 'surf', label: 'The Break' },
  { key: 'golf', label: 'The Loop' },
  { key: 'baseball', label: 'Moonshot Derby' },
  { key: 'soccer', label: 'Twelve Yards' },
  { key: 'football', label: 'Breakaway' },
  { key: 'freerun', label: 'Free Run' },
  { key: 'tennis', label: 'Match Point' },
  { key: 'tiebreak', label: 'Tiebreak Blitz' },
  // pass 5: head-to-head modes join with their session score (rounds × 100 − rival rounds × 40 for fights; points for ball games)
  { key: 'karate-vs', label: 'Storm Duel' },
  { key: 'onevone', label: 'Ones' },
  { key: 'threevthree', label: 'Threes' },
  { key: 'carnival', label: 'Game Night' },
  { key: 'volleyball', label: 'Beach Rally' },
  { key: 'dance', label: 'The Cypher' },
];

// Challenge key → the `mode` a GameSession is stored under (the GameShell prop). Measured 2026-09-04: twelve of the
// fourteen keys never matched a session mode, so best scores read 0 and those challenges settled as ties.
export const MP_SESSION_MODE: Record<string, string> = {
  dunk: 'dunkContest', threepoint: 'threePoint', sprint: 'sprint', 'big-air': 'bigAir', snowboard: 'snowboarding',
  skateboard: 'skateboarding', surf: 'surfing', golf: 'golf', baseball: 'baseball', soccer: 'soccer', football: 'football',
  freerun: 'freerun', tennis: 'tennis', tiebreak: 'tiebreak',
  'karate-vs': 'karateVersus', onevone: 'hoops1v1', threevthree: 'hoops3v3', carnival: 'carnival', volleyball: 'volleyball', dance: 'dance',
};
export function sessionModeFor(mpKey: string): string { return MP_SESSION_MODE[mpKey] ?? mpKey; }
const MP_MODE_KEYS = new Set(MP_MODES.map((m) => m.key));

/** Is a mode key eligible for an async challenge? */
export function isValidMpMode(mode: string): boolean {
  return MP_MODE_KEYS.has(mode);
}

/** Human label for a mode key (falls back to the raw key). */
export function mpModeLabel(mode: string): string {
  return MP_MODES.find((m) => m.key === mode)?.label ?? mode;
}
