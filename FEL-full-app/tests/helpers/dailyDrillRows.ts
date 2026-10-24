// DAILY-DRILL test fixtures: DrillRows shaped exactly as lib/daily-drill/load.ts readDrillRows returns them, for
// realistic accounts. Every number is a stored row's own value (a WorkoutScan's verticalCm or shot `made`, a
// MirrorSession's clean-rep share in faultCounts, a PrqEntry's score), so a pick made from them is the pick a real
// account with these rows gets.
import type { DrillRows } from '@/lib/daily-drill/load';
import { recordCheckValues } from '@/lib/mirror/baselines';
import { drillsAccess } from '@/lib/drills/access';

/** Saturday 2026-10-24, 11:00 in Los Angeles (the wallet's daily day starts 07:00 UTC). */
export const NOW = new Date('2026-10-24T18:00:00Z');
export const DAY = 86_400_000;
export const ago = (days: number, now: Date = NOW) => new Date(now.getTime() - days * DAY);

export const set = (cleanShare: number, d: number, patternId = 'squat') =>
  ({ patternId, reps: 8, faultCounts: recordCheckValues({}, { cleanShare }), createdAt: ago(d) });
export const dunk = (verticalCm: number, d: number) => ({ kind: 'dunk', metrics: { verticalCm }, createdAt: ago(d) });
/** `made` of `n` body-play shots on day `d` (formSummary's metrics: made true / false). */
export const shots = (made: number, n: number, d: number) =>
  Array.from({ length: n }, (_, i) => ({ metrics: { kind: 'shot', made: i < made, mode: 'threepoint' }, createdAt: new Date(ago(d).getTime() + i * 60_000) }));
export const prq = (attribute: string, value: number, d: number, source = 'camera', unit = 'score') =>
  ({ attribute, value, unit, source, measuredAt: ago(d) });

const OPT_IN = { scope: 'jump_numbers', granted: true, revokedAt: null };

export const blank = (): DrillRows => ({
  user: { dobYear: 1994 }, optIn: null, profile: { streakDays: 3, lastStreakAt: ago(1.2), lastActiveAt: ago(1.2) },
  claim: null, credit: 10, jumpScans: [], shotScans: [], mirrorSessions: [], prqEntries: [],
});

/**
 * An opted-in adult hooper. Jump: best 66 cm (26.0 in) → power 50. Form: squat/lunge sets 0.6–0.9 → 76. Shooting:
 * 12 of 30 counted shots → 40. The shot is the weakest number.
 */
export function hooper(): DrillRows {
  return {
    ...blank(), optIn: OPT_IN,
    jumpScans: [dunk(64, 1), dunk(66, 3), dunk(65, 6), dunk(62, 8), dunk(60, 11)],
    mirrorSessions: [set(0.6, 2), set(0.7, 5, 'lunge'), set(0.85, 9), set(0.9, 12)],
    shotScans: [...shots(5, 12, 2), ...shots(7, 18, 9)],
  };
}

/** An opted-in adult who jumps and squats but has never shot: jump 50 < form 76, so the jump. */
export function jumper(): DrillRows {
  return { ...hooper(), shotScans: [] };
}

/** A teen with the same activity. The query gates return none of the account rows for a minor; a PRQ score may exist. */
export function teen(now: Date = NOW): DrillRows {
  return { ...hooper(), user: { dobYear: now.getFullYear() - 15 }, optIn: null };
}

/** A brand-new adult: nothing measured. */
export function newAdult(): DrillRows {
  return { ...blank(), user: { dobYear: 1999 }, profile: null };
}

/** The drills page's access for an adult with every check open (no youth, no pain, the jump gate open). */
export const OPEN = drillsAccess({ isYouth: false, painDecision: null, hardStopped: false, jumpGate: { closed: false, why: '', href: null } });
/** The jump gate shut (no landing check yet: nearly everyone at launch). */
export const GATE_SHUT = drillsAccess({ isYouth: false, painDecision: null, hardStopped: false, jumpGate: { closed: true, why: 'Jumps wait for a landing check.', href: '/play/mirror/assess' } });
/** Under 18: the youth rule holds jumps. */
export const YOUTH = drillsAccess({ isYouth: true, painDecision: null, hardStopped: false, jumpGate: { closed: true, why: '', href: null } });
/** A standing intake red flag. */
export const STOPPED = drillsAccess({ isYouth: false, painDecision: null, hardStopped: true, jumpGate: { closed: false, why: '', href: null } });
