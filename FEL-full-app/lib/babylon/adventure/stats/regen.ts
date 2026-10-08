/**
 * Energy regeneration and the special meter (ADVENTURE PLAN A3, 2026-10-06).
 *
 * ENERGY is the magic and specials pool. Anyone may spend it (contracts spendPool); only A3 refills it. It refills at
 * the actor's derived rate, after a short pause from the last spend (so a caster cannot cast-and-refill in one breath),
 * and not at all while flying or knocked out: flight is an energy drain (A1's), and a regen under it would quietly undo
 * A1's tuning.
 *
 * THE SPECIAL (0..1) fills from fighting: damage dealt and damage taken, a parry, a clean dodge. It fills to full from
 * play alone, so the Mirror camera is a shortcut and never a requirement (owner rule). `SPECIAL_PLAY_REF_PER_SEC` is
 * the rate steady fighting fills it at; the Mirror may add at most that rate again (stats/mirror.ts), which is what
 * "up to twice as fast" means.
 *
 * Pure. ResourceMeter (core/ResourceMeter.ts) is the same idea for chi and chakra; it is a class over one number with
 * its own max, while the Adventure's pools are the shared `Pool` objects every lane spends from, so the tuning SHAPE is
 * kept (per-action gains, a passive trickle of zero) and the storage is the contract's.
 */
import type { DamageEvent, Pool } from '../contracts';

/** [TUNE] Seconds after an energy spend before regen resumes. */
export const ENERGY_REGEN_DELAY_SEC = 0.8;

/** [TUNE] Special per point of damage DEALT on a hit (600 damage fills it). */
export const SPECIAL_PER_DAMAGE_DEALT = 1 / 600;
/** [TUNE] Special per point of damage TAKEN (400 damage fills it: a beaten fighter gets their comeback sooner). */
export const SPECIAL_PER_DAMAGE_TAKEN = 1 / 400;
/** [TUNE] Flat gains for defence done right. */
export const SPECIAL_ON_PARRY = 0.04;
export const SPECIAL_ON_DODGE = 0.02;
export const SPECIAL_ON_BLOCK = 0.01;
/**
 * [TUNE] The reference rate steady play fills the special at, per second: a fighter landing about 13 damage a second
 * fills it in about 45 s. The Mirror's own fill is capped at this rate (so play + Mirror ≤ 2 × play).
 */
export const SPECIAL_PLAY_REF_PER_SEC = 1 / 45;

/** One actor's regen state. Allocation-free per step. */
export class EnergyRegen {
  private lastCur = Number.NaN;
  private pauseSec = 0;

  /**
   * Step one actor's energy pool. `blocked` (flying, knocked out) stops regen without resetting the pause. A drop in
   * `cur` since the last step is a spend by someone (A1, A2, fusion), and restarts the pause.
   */
  step(energy: Pool, ratePerSec: number, dt: number, blocked: boolean): void {
    if (Number.isFinite(this.lastCur) && energy.cur < this.lastCur - 1e-9) this.pauseSec = ENERGY_REGEN_DELAY_SEC;
    if (this.pauseSec > 0) this.pauseSec = Math.max(0, this.pauseSec - dt);
    else if (!blocked && energy.cur < energy.max) energy.cur = Math.min(energy.max, energy.cur + ratePerSec * dt);
    this.lastCur = energy.cur;
  }

  /** Forget the last value (after a respawn or a max change that refilled the pool). */
  reset(): void { this.lastCur = Number.NaN; this.pauseSec = 0; }
}

/** What a damage event adds to the dealer's special (before the dealer's school multiplier). */
export function specialForDealer(ev: DamageEvent): number {
  if (ev.outcome === 'hit' || ev.outcome === 'guardBreak') return Math.max(0, ev.amount) * SPECIAL_PER_DAMAGE_DEALT;
  return 0;
}

/** What a damage event adds to the target's special (before the target's school multiplier). */
export function specialForTarget(ev: DamageEvent): number {
  switch (ev.outcome) {
    case 'hit':
    case 'guardBreak':
      return Math.max(0, ev.amount) * SPECIAL_PER_DAMAGE_TAKEN;
    case 'parried': return SPECIAL_ON_PARRY;
    case 'dodged': return SPECIAL_ON_DODGE;
    case 'blocked': return SPECIAL_ON_BLOCK;
    default: return 0;
  }
}

/** Add to a special meter, clamped to 0..1. */
export function addSpecial(stats: { special: number }, amount: number): void {
  if (!(amount > 0)) return;
  stats.special = Math.min(1, stats.special + amount);
}
