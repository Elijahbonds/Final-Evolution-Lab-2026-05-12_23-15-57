// YOUR TRAINING SHOULD BE WORTH SOMETHING IN THE FIGHT (2026-09-14).
//
// Owner ask: "you should have a health bar tied to prq". The health bar already existed — `VITALS.maxHp`
// is 100 and `PlayerVitals` has run the pool, the i-frames and the revive since KARATE-NEO-COOP. What did
// not exist was any connection between it and the athlete: the constant was the same for a RECOVERING
// player and an ELITE one, and `prqGrade()` has returned a `speedMult` per band this whole time that
// nothing in any mode read.
//
// THE TWO RULES THAT SHAPE THE NUMBERS, and both are about not punishing people:
//
//   1. A GUEST IS NEVER DISADVANTAGED. Logged out there is no PRQ, and the answer is the READY band at
//      1.0x — not zero, not a penalty, not a nag. Someone trying the game for the first time must not be
//      handed a worse fighter than the person next to them because they have not done a body scan.
//
//   2. RECOVERING IS NOT A PUNISHMENT BAND. It is what the app calls you when you are tired or coming
//      back from something, which is exactly when a game should be gentler and not harsher. So the floor
//      is close to 1 and the spread is small: the difference between the worst band and the best is a
//      fifth of a health pool, which is felt without ever being the reason you lost.
//
// A FIFTH, AND NOT MORE. The temptation is to make ELITE meaningfully tankier so the scan feels rewarded.
// That turns PRQ into a paywall on difficulty — the athlete with the better scan plays an easier game —
// and the roster is not built that way. The reward for training is that the number goes up and the band
// is named after you; the fight stays a fight.
//
// Pure: no Babylon, no fetch, no storage.

import type { PrqGrade } from '../../prq';

/** Health multiplier per band. The spread is deliberately narrow — see the header. */
export const HP_MULT: Record<PrqGrade['key'], number> = {
  RECOVERING: 0.92,
  READY: 1.0,
  PRIMED: 1.06,
  ELITE: 1.12,
};

/** The band a player with no PRQ at all is treated as. Never a penalty. */
export const GUEST_BAND: PrqGrade['key'] = 'READY';

/** Hard floor on the derived pool, so no band and no bad data can produce an unplayable fighter. */
export const MIN_MAX_HP = 60;

/**
 * The player's health pool, from the base and their band.
 *
 * `band` is optional and null-safe on purpose: every caller is a game mode, and a mode that cannot reach
 * the profile (a guest, an offline load, a failed fetch) must still produce a fighter.
 */
export function prqMaxHp(baseMaxHp: number, band?: PrqGrade['key'] | null): number {
  const base = Number.isFinite(baseMaxHp) && baseMaxHp > 0 ? baseMaxHp : MIN_MAX_HP;
  const mult = HP_MULT[band ?? GUEST_BAND] ?? HP_MULT[GUEST_BAND];
  return Math.max(MIN_MAX_HP, Math.round(base * mult));
}

/**
 * Movement speed multiplier.
 *
 * Read straight off `prqGrade`'s own `speedMult` rather than a second table, because the grade already
 * publishes one and two tables for one idea is how they end up disagreeing. Clamped anyway: this file
 * should not be able to hand a mode a zero.
 */
export const MIN_SPEED_MULT = 0.85, MAX_SPEED_MULT = 1.2;

export function prqSpeedMult(grade?: Pick<PrqGrade, 'speedMult'> | null): number {
  const raw = grade?.speedMult;
  if (!Number.isFinite(raw as number)) return 1;
  return Math.max(MIN_SPEED_MULT, Math.min(MAX_SPEED_MULT, raw as number));
}

/** The one line a HUD prints about it, or '' for a guest — so no surface writes its own. */
export function prqVitalsLine(band?: PrqGrade['key'] | null): string {
  return band ? `${band} · ${Math.round((HP_MULT[band] ?? 1) * 100)}% VITALITY` : '';
}
