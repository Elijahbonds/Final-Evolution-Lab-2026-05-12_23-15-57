/**
 * lib/feel/rally-outcome.ts
 *
 * PHASE 8 / Handoff PART 7 (Court-Rally) — presentation-layer outcome helpers.
 *
 * This module does NOT fork CourtRallyCore. The headless core
 * (lib/feel/cores/court-rally-core.ts) already classifies timing into a
 * ContactQuality; Part 7 Fix 1 mandates that the *rendering* layer wire all
 * five qualities to DISTINCT outcomes ("Binary hit/miss kills this core").
 * The 2D skins (tennis-game, soccer-game) do their own canvas hit-testing and
 * never imported the core, so this pure helper gives them — and the headless
 * tests — one shared source of truth for:
 *   Fix 1  three+ failure states (early=lunge / late=weak / perfect=fist-pump)
 *   Fix 2  ghost landing marker timing + predicted landing spot
 *   Fix 4  goalkeeper dive commitment (commit early, player reads the lean)
 *
 * Everything here is pure & deterministic (all randomness is caller-supplied),
 * so scripts/rally-outcome-tests.ts can assert the invariants headlessly.
 */

import type { ContactQuality } from './cores/court-rally-core';

export type { ContactQuality };

// ---------------------------------------------------------------------------
// Fix 1 — timing → quality → distinct outcome
// ---------------------------------------------------------------------------

/** Timing thresholds around the ideal contact instant (ms). // TUNE(elijah) */
export const RALLY = {
  PERFECT_MS: 45,   // |error| <= this  -> perfect
  GOOD_MS: 110,     // |error| <= this  -> good
  WINDOW_MS: 190,   // |error| <= this  -> early/late (still a contact)
  // beyond WINDOW_MS -> miss (whiff, point lost)
  EARLY_RECOVERY_MS: 1000, // lunge recovery lock before next shot
} as const;

export interface ShotOutcome {
  quality: ContactQuality;
  /** ball speed scalar applied to the return (0 = no return). */
  ballSpeedMult: number;
  /** ball dumped into the net (early lunge). */
  netBall: boolean;
  /** recovery lock in ms before the player may swing again. */
  recoveryMs: number;
  /** trigger the fist-pump celebration + crowd cheer. */
  fistPump: boolean;
  /** weak floaty return the opponent can smash. */
  weak: boolean;
  /** the point is lost outright (whiff). */
  pointLost: boolean;
  /** short HUD label. */
  label: string;
  /** token colour for the label. */
  color: string;
}

/**
 * Classify a signed timing error (ms; negative = swung early, positive = late)
 * into one of the five contact qualities. Symmetric magnitude thresholds; the
 * SIGN decides early vs late inside the window.
 */
export function classifyContact(errorMs: number): ContactQuality {
  const a = Math.abs(errorMs);
  if (a <= RALLY.PERFECT_MS) return 'perfect';
  if (a <= RALLY.GOOD_MS) return 'good';
  if (a <= RALLY.WINDOW_MS) return errorMs < 0 ? 'early' : 'late';
  return 'miss';
}

/** Map a quality to its concrete, DISTINCT render outcome (Part 7 Fix 1). */
export function resolveShot(quality: ContactQuality): ShotOutcome {
  switch (quality) {
    case 'perfect':
      return {
        quality, ballSpeedMult: 1.35, netBall: false, recoveryMs: 0,
        fistPump: true, weak: false, pointLost: false,
        label: 'PERFECT!', color: '#FFD700',
      };
    case 'good':
      return {
        quality, ballSpeedMult: 1.0, netBall: false, recoveryMs: 0,
        fistPump: false, weak: false, pointLost: false,
        label: 'GOOD', color: '#00FF9D',
      };
    case 'early':
      // Lunge: ball into the net, hard to recover.
      return {
        quality, ballSpeedMult: 0, netBall: true, recoveryMs: RALLY.EARLY_RECOVERY_MS,
        fistPump: false, weak: false, pointLost: false,
        label: 'EARLY — LUNGE', color: '#FF3366',
      };
    case 'late':
      // Weak return: slow, floaty; opponent gets an easy smash. No recovery lock.
      return {
        quality, ballSpeedMult: 0.6, netBall: false, recoveryMs: 0,
        fistPump: false, weak: true, pointLost: false,
        label: 'LATE — WEAK', color: '#FF8A3D',
      };
    case 'miss':
    default:
      return {
        quality: 'miss', ballSpeedMult: 0, netBall: false, recoveryMs: 0,
        fistPump: false, weak: false, pointLost: true,
        label: 'MISS', color: '#FF3366',
      };
  }
}

// ---------------------------------------------------------------------------
// Fix 2 — ghost landing marker
// ---------------------------------------------------------------------------

/** Show the ghost marker this many seconds before the ball arrives. // TUNE(elijah) */
export const GHOST_LEAD_S = 0.5;

/**
 * Whether the ghost landing marker should be visible right now.
 * timeToLandS = seconds until the ball reaches the receiver baseline.
 * Visible once the ball is within `lead` seconds AND still airborne.
 */
export function ghostVisible(timeToLandS: number, lead: number = GHOST_LEAD_S): boolean {
  return timeToLandS > 0 && timeToLandS <= lead;
}

/** Marker opacity ramps in as the ball approaches (0..1). */
export function ghostOpacity(timeToLandS: number, lead: number = GHOST_LEAD_S): number {
  if (timeToLandS <= 0) return 1;
  if (timeToLandS >= lead) return 0;
  return 1 - timeToLandS / lead;
}

/**
 * Predict the X where the ball crosses receiver baseline Y (2D top-down court).
 * Ball has near-constant vertical velocity `vy` toward `targetY`; horizontal
 * velocity `vx` plus a spin term that curves the path. Returns the crossing X
 * (unclamped — caller clamps to court bounds).
 */
export function predictLandingX(
  bx: number, by: number, vx: number, vy: number, targetY: number, spin: number = 0,
): number {
  if (vy === 0) return bx;
  const t = (targetY - by) / vy; // seconds to reach targetY
  if (t <= 0) return bx;
  // spin curves vx over the flight: x = bx + vx*t + 0.5*(spin*k)*t^2
  const SPIN_ACCEL = 60; // matches tennis-game st.spin * 60 term
  return bx + vx * t + 0.5 * spin * SPIN_ACCEL * t * t;
}

// ---------------------------------------------------------------------------
// Fix 4 — goalkeeper dive commitment (soccer / penalty)
// ---------------------------------------------------------------------------

/** Keeper commits its guess this long after the shot animation starts. // TUNE(elijah) */
export const GK_COMMIT_S = 0.3;

export type Side = -1 | 0 | 1; // left | center | right

/**
 * The keeper's committed guess given a caller-supplied roll (0..1) and an
 * optional read bias toward the *actual* shot side (skill of the AI). When the
 * roll is under `readChance` the keeper reads the shot; otherwise it guesses a
 * random side. Center (0) is never guessed — the keeper always commits L or R
 * so there is always a lean for the player to read.
 */
export function gkGuess(roll: number, readChance: number, actualSide: Side, sideRoll: number): Side {
  if (roll < readChance && actualSide !== 0) return actualSide;
  return sideRoll < 0.5 ? -1 : 1;
}

/**
 * Resolve a penalty. The player should chip OPPOSITE the keeper's committed
 * lean. Opposite side (or keeper guessed a side while player went center-ish
 * away from it) => goal. Same side => save.
 */
export function resolvePenalty(shotSide: Side, gkSide: Side): 'goal' | 'save' {
  if (gkSide === 0) return 'goal'; // keeper never committed -> open net
  if (shotSide === gkSide) return 'save';
  return 'goal';
}

/** Reduce a fine-grained aim zone (-2..2) to a coarse Side for resolution. */
export function zoneToSide(zone: number): Side {
  if (zone < 0) return -1;
  if (zone > 0) return 1;
  return 0;
}

/**
 * Keeper lean amount for rendering, ramping 0..1 across the commit window so
 * the dive is VISIBLE before the ball lands (Part 7 Fix 4).
 * tSinceShotS = seconds since the shot animation began.
 */
export function gkLean(tSinceShotS: number, commitS: number = GK_COMMIT_S): number {
  if (tSinceShotS <= commitS) return 0;
  const over = tSinceShotS - commitS;
  const RAMP = 0.35; // seconds to full lean after commit
  return over >= RAMP ? 1 : over / RAMP;
}
