// VolleyPlay — the volleyball-only rules NetSportMode plays on top of RallyCore (IMPROVE 2026-10-06).
//
// Babylon-free on purpose, like RallyCore: every rule here is arithmetic the tests execute rather than read. The
// mode owns the meshes, the input and the HUD; this owns WHO serves, how a serve toss is graded, what an attack does
// to the dig that answers it, the two sets the player can call, and what the rally cap does.

import { SWING_BANDS, gradeSwing, type Shot, type SwingQuality } from './RallyCore';

// ── the serve ───────────────────────────────────────────────────────────────

/** Rally scoring: whoever won the rally serves the next one (the real rule; the player used to serve every point). */
export function nextServer(winner: 0 | 1): 0 | 1 { return winner; }

/**
 * THE TOSS. The serve fired by itself at a fixed 'good' quality — dead time on every point. The player now tosses
 * and strikes: the ball rises off the hand and the ideal contact is TOSS_SEC after the toss, on its way down.
 */
export const TOSS_SEC = 1.1;
/** How high the toss climbs above the hand, in metres. */
export const TOSS_HEIGHT = 1.6;
/** Tosses the player may let fall before the serve goes over anyway as a weak ball (so a serve can never stall a match). */
export const TOSS_RETRIES = 1;

/** Height of the toss above the hand at `elapsed` seconds: up to TOSS_HEIGHT just past halfway, falling at contact. */
export function tossHeight(elapsed: number): number {
  const u = elapsed / TOSS_SEC;
  return Math.max(-1.4, TOSS_HEIGHT * (1 - ((u - 0.55) / 0.55) ** 2));
}

/**
 * Grade a serve press `elapsed` seconds into the toss. 'wait' is a press so early it is not a serve at all (refused,
 * no penalty); otherwise the swing bands every touch is graded on, centred on the toss's contact point.
 */
export function gradeToss(elapsed: number): SwingQuality | 'wait' {
  const dt = elapsed - TOSS_SEC;
  if (dt < -SWING_BANDS.ok) return 'wait';
  return gradeSwing(dt);
}

/** Has the toss fallen past the last late band without a press? */
export function tossDropped(elapsed: number): boolean { return elapsed - TOSS_SEC > SWING_BANDS.ok; }

// ── the dig ─────────────────────────────────────────────────────────────────

/**
 * Receiving an attack degrades the dig by `steps`. A good ball becomes a late one, and a late (or early) one is shanked
 * with probability `shankChance`. This is the rule aiReturn already played for the opponent; it now lives here so the
 * player's dig of THEIR spike can pay the same kind of price.
 */
export function degradeDig(q: SwingQuality, steps: number, shankChance: number, rand: () => number = Math.random): SwingQuality {
  for (let i = 0; i < steps; i++) {
    if (q === 'perfect') q = 'good';
    else if (q === 'good') q = 'late';
    else if ((q === 'late' || q === 'early') && rand() < shankChance) q = 'miss';
  }
  return q;
}

/** The opponent's shank chance on a late dig of the player's spike (unchanged from aiReturn's 0.45). */
export const AI_SPIKE_SHANK = 0.45;
/**
 * The player's shank chance on a late dig of the opponent's spike. TUNED (2026-10-06): new — the player's dig was
 * never degraded at all. Kept well under the opponent's 0.45, because the player also has to get their feet there.
 */
export const HUMAN_SPIKE_SHANK = 0.25;

// ── the set ─────────────────────────────────────────────────────────────────

/**
 * The set the player calls before the second touch. HIGH is the set the mode always played (apex 4.4 m, 1.5 × the base
 * flight — the slowest ball in the sport, which buys the attacker time). QUICK is low and fast: less time to get under
 * it, and a spike off it is one step harder for the opponent to dig.
 */
export type SetCall = 'high' | 'quick';
export const QUICK_SET = { apex: 2.2, flightMul: 0.62 } as const;
/** Reshape a planned HIGH set into a quick one, in place. A high call leaves the plan exactly as planShot made it. */
export function shapeSet(s: Shot, call: SetCall): Shot {
  if (call === 'quick') { s.apex = QUICK_SET.apex; s.duration *= QUICK_SET.flightMul; }
  return s;
}
/** Dig steps the opponent pays on the player's spike: one, two when KINETIC, one more off a quick set — never past two. */
export function spikeDigSteps(kinetic: boolean, offQuickSet: boolean): number {
  return Math.min(2, (kinetic ? 2 : 1) + (offQuickSet ? 1 : 0));
}

// ── the rally cap ───────────────────────────────────────────────────────────

/**
 * What the rally cap does. It awarded the point to whichever side was not receiving at the 24 s mark — arbitrary, and
 * losing to it felt unfair. TUNED (2026-10-06): the point is REPLAYED, by the same server, and nobody scores.
 */
export type RallyCapOutcome = { kind: 'replay' };
export function rallyCapOutcome(): RallyCapOutcome { return { kind: 'replay' }; }

// ── the HUD ─────────────────────────────────────────────────────────────────

/** The timing meter quantised to 1/50: the HUD is pushed only when this value changes. */
export function quantiseMeter(t: number): number { return Math.round(Math.max(0, Math.min(1, t)) * 50) / 50; }

/** The block chip: READY, or the whole seconds left on the cooldown (rounded up, so it never reads 0s). */
export function blockChip(cooldownSec: number): string { return cooldownSec <= 0 ? 'READY' : `${Math.ceil(cooldownSec)}s`; }
