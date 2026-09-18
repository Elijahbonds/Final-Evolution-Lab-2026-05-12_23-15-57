// TennisCore — Mode 7 Phases 2+3: court movement with footwork weight, the
// positioning-quality model, and the ONE-timing-input shot system that is
// the depth target.
//
//   CourtMovement-based footwork: split-step (a pre-contact readiness beat
//     that widens your timing window), recovery-to-center after a shot
//     (getting back is part of the NEXT shot's quality).
//   PositioningQuality — how set you are at contact: feet set + inside
//     reach + not sprinting = wide window + full menu. Stretching/on-the-
//     run = narrow window + the aggressive shot types drop off the menu
//     (positioning constrains OPTIONS, not just a window scalar).
//   ShotTiming — ONE input (the swing's timing offset) simultaneously
//     shapes power, placement, and spin: early = defensive/short/angled
//     off, perfect = full, late = jammed/weak. The same input reads as a
//     different SHOT by context — on-the-run late contact is a hacky slice
//     whether you meant it or not. That IS the depth.

import { Vector3 } from '@babylonjs/core';
import { CourtMovement, DEFAULT_MOVEMENT } from './CourtMovement';
import { gradeSwing, type SwingQuality } from './RallyCore';

export const TENNIS_MOVE = { ...DEFAULT_MOVEMENT, maxSpeed: 7.0, accel: 24, decel: 32, plantBleedSec: 0.1 };

// ── Positioning ────────────────────────────────────────────────────────────
export interface PositionInput {
  distToContact: number;        // m from ideal contact point
  speedAtContact: number;       // m/s (sprinting into the ball = bad)
  splitStepped: boolean;        // took the readiness beat
  recovered01: number;          // how recovered to a sensible spot (0..1)
}

export function positioningQuality(i: PositionInput): number {
  let q = 1;
  q -= Math.min(0.45, Math.abs(i.distToContact) * 0.3);       // reach
  q -= Math.min(0.3, i.speedAtContact * 0.05);                // on the run
  if (i.splitStepped) q += 0.15;
  q -= (1 - i.recovered01) * 0.2;
  return Math.max(0.05, Math.min(1, q));
}

/** The effective timing window scales with positioning (set feet = wider). */
export function effectiveWindow(quality01: number, base: number): number {
  return base * (0.45 + quality01 * 1.1);
}

// ── The one-timing-input shot ──────────────────────────────────────────────
export type ShotOutcome = 'whiff' | 'dump' | 'defensive' | 'neutral' | 'aggressive' | 'winner';

export interface TennisShot {
  outcome: ShotOutcome;
  power01: number;
  /** placement error in meters from the target line */
  placementErr: number;
  /** spin rate produced (rad/s) — sign drives topspin/slice */
  spin: number;
  /** the shot type the context FORCED (on-the-run late = slice hack) */
  forcedType: 'topspin' | 'slice' | 'flat' | null;
  quality: SwingQuality;
  why: string;
}

export function resolveShotTiming(
  dtOffset: number, positionQ01: number, intended: 'topspin' | 'slice' | 'flat' | 'drop' | 'lob',
): TennisShot {
  const window = effectiveWindow(positionQ01, 0.34);
  const k = dtOffset / window;                       // in-window normalized
  const quality = gradeSwing(dtOffset);
  if (quality === 'miss') {
    return { outcome: 'whiff', power01: 0, placementErr: 99, spin: 0, forcedType: null, quality, why: 'No contact — the ball was past you' };
  }

  const absK = Math.abs(k);
  // power is timing-asymmetric: LATE contact jams you (weaker than early)
  const timingPower = k > 0 ? Math.max(0.2, 1 - k * 0.75) : Math.max(0.3, 1 + k * 0.45);
  const power01 = timingPower * (0.6 + positionQ01 * 0.4);
  const placementErr = Math.abs(k) * (1.6 - positionQ01 * 1.1);   // late/early + stretched = wide
  const early = k < -0.25, late = k > 0.25;

  // ONE input reads as different SHOTS by context:
  let forcedType: TennisShot['forcedType'] = null;
  if (positionQ01 < 0.4 && late) forcedType = 'slice';            // on-the-run hack
  else if (early && intended === 'flat') forcedType = 'slice';    // early flat reads as a chip
  const effective = forcedType ?? (intended === 'drop' || intended === 'lob' ? intended : intended);

  let spin = 0;
  if (effective === 'topspin') spin = 220 * (1 - absK * 0.4) * (late ? 0.6 : 1);
  else if (effective === 'slice') spin = -160 * (1 - absK * 0.3);
  else if (effective === 'flat') spin = 20;

  let outcome: ShotOutcome;
  if (quality === 'perfect' && positionQ01 > 0.75) outcome = 'winner';
  else if (positionQ01 < 0.45 && (early || late)) outcome = 'defensive';   // stretched off-timing = survival ball
  else if (quality === 'perfect' || (quality === 'good' && positionQ01 > 0.5)) outcome = 'aggressive';
  else if (quality === 'good') outcome = 'neutral';
  else if (early || late) outcome = positionQ01 < 0.3 ? 'dump' : 'defensive';
  else outcome = 'neutral';

  const why = [
    quality === 'perfect' ? 'Timed it' : early ? 'Out in front' : late ? 'Caught late' : 'On it',
    positionQ01 > 0.7 ? 'feet set' : positionQ01 > 0.4 ? 'moving through it' : 'stretched',
    forcedType ? `forced a ${forcedType}` : intended,
  ].join(' — ');

  return { outcome, power01, placementErr, spin, forcedType, quality, why };
}
