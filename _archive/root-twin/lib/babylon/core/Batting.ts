// Batting — Mode 6 Phases 4+5: the swing input, plate coverage, and the
// bat-ball physics + feedback that beat The Show's timing clarity.
//
//   PCI (plate coverage indicator) — the batter aims a reticle in the
//     zone; contact quality depends on PCI-ball distance AND timing.
//   Swing types — CONTACT (bigger timing window, capped exit velo) vs
//     POWER (tighter window, real exit-velo ceiling). A real tradeoff.
//   Contact physics — bat-ball is computed: exit velocity + launch angle
//     + spin derive from (timing, PCI distance, pitch velo/break, swing
//     type). Whiff/foul/weak/solid/barrel all EMERGE — no hit/miss dice.
//   Feedback — every swing returns a SwingReport: timing grade, PCI
//     distance, contact point, and a plain-language WHY. The player always
//     understands what just happened.

import { Vector3 } from '@babylonjs/core';
import { ZONE, type PitchType } from './Pitching';

// ── PCI + swing types ──────────────────────────────────────────────────────
export type SwingType = 'contact' | 'power';

export const SWING: Record<SwingType, { windowSec: number; maxExitVelo: number; pciRadius: number }> = {
  contact: { windowSec: 0.24, maxExitVelo: 38, pciRadius: 0.34 },
  power:   { windowSec: 0.15, maxExitVelo: 50, pciRadius: 0.26 },
};

export class PCI {
  x = 0; y = (ZONE.bottom + ZONE.top) / 2;
  aim(dx: number, dy: number): void {
    this.x = Math.max(-ZONE.halfW * 1.5, Math.min(ZONE.halfW * 1.5, this.x + dx));
    this.y = Math.max(ZONE.bottom - 0.3, Math.min(ZONE.top + 0.3, this.y + dy));
  }
}

// ── Timing ─────────────────────────────────────────────────────────────────
export type TimingGrade = 'whiff' | 'wayEarly' | 'early' | 'perfect' | 'late' | 'wayLate';

/** Timing offset at contact: seconds from the ideal contact moment. */
export function gradeTiming(offsetSec: number, swing: SwingType): TimingGrade {
  const w = SWING[swing].windowSec;
  const a = Math.abs(offsetSec);
  if (a > w * 1.6) return offsetSec < 0 ? 'wayEarly' : 'wayLate';
  if (a <= w * 0.3) return 'perfect';
  return offsetSec < 0 ? 'early' : 'late';
}

// ── Contact physics ────────────────────────────────────────────────────────
export type ContactOutcome = 'whiff' | 'foul' | 'weak' | 'solid' | 'barrel';

export interface SwingReport {
  timing: TimingGrade;
  pciDistM: number;             // how far the PCI was from the pitch
  outcome: ContactOutcome;
  exitVelo?: number;            // m/s
  launchAngleDeg?: number;
  spinAxis?: Vector3;
  why: string;                  // plain-language explanation (the feedback)
}

/** The bat-ball event. Real inputs in, real batted ball out — and a full
 *  explanation. */
export function contactEvent(
  timingOffsetSec: number, pci: PCI, pitchPosAtPlate: Vector3,
  pitch: PitchType, swing: SwingType,
): SwingReport {
  const timing = gradeTiming(timingOffsetSec, swing);
  const pciDist = Math.hypot(pci.x - pitchPosAtPlate.x, pci.y - pitchPosAtPlate.y);
  const sw = SWING[swing];
  const pci01 = Math.max(0, 1 - pciDist / sw.pciRadius);   // 1 = squared

  if (timing === 'whiff' || timing === 'wayEarly' || timing === 'wayLate') {
    return { timing, pciDistM: pciDist, outcome: 'whiff',
      why: timing === 'wayEarly' ? 'Way out in front — the ball was still coming' : 'Way late — the ball was by you' };
  }
  if (pci01 <= 0.05) {
    return { timing, pciDistM: pciDist, outcome: 'whiff',
      why: 'Swung over/under it — the barrel never crossed the ball' };
  }

  // exit velo: swing ceiling × timing quality × PCI quality × pitch pace
  const timing01 = timing === 'perfect' ? 1 : 0.55;
  const pitchBoost = 1 + (pitch.velo - 35) * 0.012;         // hit a fastball harder
  const exitVelo = sw.maxExitVelo * timing01 * (0.4 + pci01 * 0.6) * pitchBoost;
  // launch angle: PCI height vs pitch height drives it
  const vertErr = pci.y - pitchPosAtPlate.y;
  const launch = 12 + -vertErr * 60 + (timing === 'early' ? 18 : timing === 'late' ? -8 : 0);
  const spinAxis = new Vector3(
    timing === 'early' ? 18 : timing === 'late' ? -18 : 4,   // pulled hooks / sliced
    0, 160 + exitVelo * 2);

  let outcome: ContactOutcome;
  if (timing === 'perfect' && pci01 > 0.85) outcome = 'barrel';
  else if (timing === 'perfect' || pci01 > 0.7) outcome = 'solid';
  else if (Math.abs(vertErr) > 0.2) outcome = pci01 > 0.4 ? 'weak' : 'foul';
  else outcome = pci01 > 0.4 ? 'weak' : 'foul';

  const whyParts = [
    timing === 'perfect' ? 'Perfect timing' : timing === 'early' ? 'A tick early' : 'A tick late',
    pci01 > 0.85 ? 'barrel right on it' : pci01 > 0.5 ? 'off the barrel a touch' : 'off the end/handle',
  ];
  const why = `${whyParts.join(', ')} → ${outcome.toUpperCase()}`;
  return { timing, pciDistM: pciDist, outcome, exitVelo, launchAngleDeg: launch, spinAxis, why };
}
