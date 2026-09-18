// A MOOK THAT DROPS ON ONE TOUCH HAS NO HEALTH BAR WORTH DRAWING (2026-09-14).
//
// Karate endless shipped with `landHit` setting `t.hp = 0` unconditionally, under a comment calling it
// "Revolutions weight: the body drops on ONE solid strike — no damage math, no second hit to finish". That
// was a real decision and it made the mode feel like the lobby scene. The owner has asked for the One
// Piece read instead: enemies that ABSORB, with a bar you watch come down, so a wave is a fight rather
// than a mowing.
//
// Owner decision, 2026-09-14: **three hits at wave 1.**
//
// WHY THIS IS A MODULE AND NOT TWO NUMBERS IN THE MODE. The wave economy is a system: how many bodies
// spawn, how long a wave lasts, how much the player's pool can take while it lasts, and how fast the chi
// meter fills all move together. Putting the health curve somewhere testable is what lets the rest be
// tuned against it instead of around it.
//
// THE THING THAT MUST NOT BREAK — and the reason the wave curve is so shallow:
//
//   ONE SWING STILL CLEARS A CROWD.
//
// The mode's fantasy is that a strike reaches every body in the arc, and it already does
// (`for (const e of [...hit]) landHit(...)`). Tripling each body's health while a swing hits four of them
// is fine; tripling it again by wave 6 is not, because the arc stops keeping up and the fantasy turns into
// attrition. The cap is the guard on that, and there is a test for it.
//
// Pure: no Babylon, no randomness.

/** Owner decision (2026-09-14). Light hits to drop a standard body on the first wave. */
export const HITS_AT_WAVE_1 = 3;

/** Damage of one landed strike, in the same units as the health pool. A light hit is the unit. */
export const HIT_DAMAGE: Record<'light' | 'medium' | 'heavy' | 'finisher', number> = {
  light: 1,
  medium: 1.5,
  heavy: 2.5,
  finisher: 4,       // a completed route ender drops a wave-1 body outright, which is what a finisher is for
};

/** How much tougher a body gets per wave. Deliberately shallow — see the header. */
export const HP_PER_WAVE = 0.34;
/** Nobody gets tougher than this, ever. The arc has to keep clearing crowds. */
export const MOOK_HP_CAP = 6;

/**
 * A standard body's pool on `wave`.
 *
 * Waves are 1-based; anything below reads as wave 1, because a zeroth wave is a bug somewhere else and a
 * mook with no health is worse than a mook with too much.
 */
export function mookMaxHp(wave: number): number {
  if (!Number.isFinite(wave)) return HITS_AT_WAVE_1;
  const w = Math.max(1, Math.floor(wave));
  return Math.min(MOOK_HP_CAP, HITS_AT_WAVE_1 + (w - 1) * HP_PER_WAVE);
}

/** How many LIGHT hits this wave's body takes. The number the tuning conversation is actually about. */
export function hitsToDrop(wave: number): number {
  return Math.ceil(mookMaxHp(wave) / HIT_DAMAGE.light);
}

/**
 * Apply one strike. Returns the pool left, floored at 0.
 *
 * `launched` is the mode's own airborne-helpless state: a body already in the air takes more, which is
 * what makes launching into a follow-up worth doing rather than just decorative.
 */
export const LAUNCH_BONUS_MULT = 1.6;

export function damageMook(hp: number, weight: keyof typeof HIT_DAMAGE, launched = false): number {
  const d = HIT_DAMAGE[weight] ?? HIT_DAMAGE.light;
  return Math.max(0, hp - d * (launched ? LAUNCH_BONUS_MULT : 1));
}

/** 0..1 for the bar. A dead body reads 0 rather than a negative sliver. */
export function mookHp01(hp: number, maxHp: number): number {
  if (!(maxHp > 0)) return 0;
  return Math.max(0, Math.min(1, hp / maxHp));
}

/** Bar colour by remaining fraction — green, amber, red. One place, so no surface invents its own. */
export function mookBarHex(hp01: number): string {
  if (hp01 > 0.6) return '#8fe0a0';
  if (hp01 > 0.3) return '#ffd75e';
  return '#ff4d4d';
}
