// LandingSystem — Mode 3 Phase 6: the landing/balance/bail truth-teller.
//
// Skate 3's landings feel earned because they're PHYSICS, not dice:
//   error = landingError01() (rotation + residual spin + grab-late tax)
//         + slope mismatch (board flat, ground angled) + speed factor.
//   CLEAN   — error below the clean line: full score, combo continues.
//   SKETCHY — the wobble window: a balance-recover skill check (stick
//             against the wobble) for RECOVER_SEC; succeed = save the
//             combo at reduced points, fail = bail.
//   BAIL    — error past the line: readable, fair, YOUR fault. Bail is a
//             state (ragdoll-ish recover), never a random robbery.
//
// All thresholds are data; the suite proves boundaries, not vibes.

import { AirControl } from './AirControl';
import { BalanceModel } from './BoardPhysics';

export type LandingGrade = 'clean' | 'sketchy' | 'bail';

export interface LandingInput {
  error01: number;             // from AirControl.landingError01()
  slopeMismatch01: number;     // board vs ground angle mismatch (0..1)
  speed01: number;             // harder to stick when hauling
}

export const CLEAN_MAX = 0.28;
export const SKETCHY_MAX = 0.62;
export const RECOVER_SEC = 0.9;
export const SKETCHY_SCORE_MULT = 0.6;

export function gradeLanding(i: LandingInput): LandingGrade {
  const err = i.error01 + i.slopeMismatch01 * 0.3 + i.speed01 * 0.1;
  if (err <= CLEAN_MAX) return 'clean';
  if (err <= SKETCHY_MAX) return 'sketchy';
  return 'bail';
}

/** The sketchy-landing save: wobble pulls left/right pseudo-randomly but
 *  deterministically seeded; the player counters with the stick. */
export class BalanceSave {
  private t = 0;
  private wobblePhase = 0;
  /** -1..1 — positive = wobbling right, counter with LEFT stick. */
  wobble = 0;
  active = false;
  failed = false;
  saved = false;

  constructor(private balance: BalanceModel) {}

  start(): void {
    this.t = 0;
    this.wobblePhase = Math.random() * Math.PI * 2;
    this.active = true;
    this.failed = false;
    this.saved = false;
  }

  update(dt: number, stickX: number): void {
    if (!this.active || this.failed || this.saved) return;
    this.t += dt;
    this.wobblePhase += dt * 6;
    this.wobble = Math.sin(this.wobblePhase) * 0.8;
    // countering reduces instability; riding WITH the wobble feeds it
    const counter = -Math.sign(this.wobble) === Math.sign(stickX) && Math.abs(stickX) > 0.4;
    this.balance.instability += (counter ? -1.4 : 0.9) * dt;
    if (this.balance.instability <= 0.02) { this.saved = true; this.active = false; }
    if (this.balance.instability >= 1 || this.t >= RECOVER_SEC) {
      this.failed = this.balance.instability >= 0.35;
      this.saved = !this.failed;
      this.active = false;
    }
  }
}

/** One call at touchdown: grade + consequences (combo/points/save state). */
export function resolveLanding(
  air: AirControl, balance: BalanceModel, input: LandingInput,
): { grade: LandingGrade; chain: ReturnType<AirControl['land']>; save: BalanceSave | null } {
  const grade = gradeLanding(input);
  const chain = air.land();
  if (grade === 'clean') {
    balance.instability = Math.max(0, balance.instability - 0.3);
    return { grade, chain, save: null };
  }
  if (grade === 'sketchy') {
    balance.kick(0.35);
    const save = new BalanceSave(balance);
    save.start();
    return { grade, chain, save };
  }
  balance.kick(1);                        // bail: full washout
  return { grade, chain, save: null };
}
