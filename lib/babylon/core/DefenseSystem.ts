// DefenseSystem — Mode 2 Phase 4: the four ways to not get hit, each with
// DISTINCT timing, cost, and payoff. This is the skill-expression core of
// the whole suite.
//
//   BLOCK     — hold it. Chips the guard gauge; breaks when empty.
//               Zero execution cost, loses to pressure. (FightCore's base.)
//   PARRY     — tap block inside 160ms of impact. Attacker staggers; you
//               get a small counter window. Timing-only. (FightCore's base.)
//   GUARD IMPACT — Soul Calibur's: block-tap + flick TOWARD the attacker
//               inside a tighter 90ms window. NO-SELLS the hit entirely
//               (even heavies that chip block), long punish window. Fails
//               hard: a whiffed impact leaves you open (recovery).
//   SUBSTITUTION — Naruto Storm's: teleport behind the attacker the instant
//               before a hit lands. Costs chi, real cooldown, and a
//               vulnerability window — if the opponent reads it and swings
//               again inside that window, you eat COUNTER damage.

import { Vector3 } from '@babylonjs/core';
import type { AttackDef, FighterState } from './FightCore';
import { PARRY_WINDOW_MS } from './FightCore';

export const GUARD_IMPACT_WINDOW_MS = 90;
export const GUARD_IMPACT_STAGGER_SEC = 1.15;      // attacker's punish window
export const GUARD_IMPACT_RECOVERY_SEC = 0.5;      // whiffed impact = you're open
export const SUBSTITUTION_CHI_COST = 25;
export const SUBSTITUTION_COOLDOWN_SEC = 3.0;
export const SUBSTITUTION_VULN_SEC = 0.6;          // read-it-and-punish window
export const COUNTER_DAMAGE_MULT = 1.5;

export type DefenseAction =
  | 'none' | 'blocked' | 'parried' | 'guardImpacted' | 'substituted';

export class DefenseController {
  /** set by input: block held, and the timestamp+direction of the last
   *  block press (direction flick = guard impact attempt) */
  private blockHeld = false;
  private pressMs = -1e9;
  private flickTowardFoe = false;
  private impactRecoveryUntil = 0;      // whiffed impact penalty
  private substitutionReadyAt = 0;
  /** set when this fighter just substituted — they're punishable until then */
  vulnerableUntil = 0;

  pressBlock(nowMs: number, stickTowardFoe: boolean): void {
    this.blockHeld = true;
    this.pressMs = nowMs;
    this.flickTowardFoe = stickTowardFoe;
  }
  releaseBlock(): void { this.blockHeld = false; }

  get blocking(): boolean { return this.blockHeld; }
  get inImpactRecovery(): boolean { return performance.now() < this.impactRecoveryUntil; }

  canSubstitute(chi: number, nowMs: number): boolean {
    return chi >= SUBSTITUTION_CHI_COST && nowMs >= this.substitutionReadyAt;
  }

  /**
   * The authoritative answer to "an attack with `atk` lands at `dist` on
   *  me at `nowMs`". Mutates nothing — returns the defense action and lets
   *  the caller apply FightCore state changes (keeps one mutation site).
   */
  resolve(atk: AttackDef, dist: number, blocking: boolean, nowMs: number): DefenseAction {
    if (dist > atk.range) return 'none';
    const sincePress = nowMs - this.pressMs;
    // Guard impact: tighter window AND the directional flick. No-sells.
    if (sincePress >= 0 && sincePress <= GUARD_IMPACT_WINDOW_MS && this.flickTowardFoe) {
      return 'guardImpacted';
    }
    // Parry: timing only.
    if (sincePress >= 0 && sincePress <= PARRY_WINDOW_MS) return 'parried';
    if (blocking) return 'blocked';
    return 'none';
  }

  /** A guard-impact attempt that did NOT meet an attack whiffs: recovery. */
  whiffImpact(nowMs: number): void {
    this.impactRecoveryUntil = nowMs + GUARD_IMPACT_RECOVERY_SEC * 1000;
  }

  /** Spend the substitution: chi is deducted by the caller (FighterState). */
  spendSubstitution(nowMs: number): void {
    this.substitutionReadyAt = nowMs + SUBSTITUTION_COOLDOWN_SEC * 1000;
    this.vulnerableUntil = nowMs + SUBSTITUTION_VULN_SEC * 1000;
  }

  /** Where the substituter reappears: directly behind the attacker. */
  static substitutionSpot(attackerPos: Vector3, attackerFacingRad: number, behind = 1.1): Vector3 {
    return new Vector3(
      attackerPos.x - Math.sin(attackerFacingRad) * behind,
      attackerPos.y,
      attackerPos.z - Math.cos(attackerFacingRad) * behind,
    );
  }
}

/** Apply the defense outcome to attacker/defender FighterStates (the single
 *  mutation site paired with DefenseController.resolve). Returns a label
 *  for HUD/juice. */
export function applyDefenseOutcome(
  action: DefenseAction,
  attacker: FighterState, defender: FighterState, atk: AttackDef,
): 'whiff' | 'blocked' | 'guardBreak' | 'parried' | 'guardImpacted' | 'substituted' | 'hit' {
  switch (action) {
    case 'none': return 'whiff';
    case 'blocked': {
      defender.guard -= atk.guardDmg;
      if (defender.guard <= 0) {
        defender.guard = 0;
        defender.blockHeld = false;
        defender.staggerSec = 1.4;
        return 'guardBreak';
      }
      return 'blocked';
    }
    case 'parried':
      attacker.staggerSec = 0.9;
      return 'parried';
    case 'guardImpacted':
      attacker.staggerSec = GUARD_IMPACT_STAGGER_SEC;   // long punish window
      return 'guardImpacted';
    case 'substituted':
      return 'substituted';
  }
}
