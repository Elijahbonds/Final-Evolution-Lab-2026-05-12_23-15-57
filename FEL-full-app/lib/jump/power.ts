// power — peak power from a jump and an optional body weight, adults only, labelled an estimate (JUMP-PRO 2, 2026-10-25;
// owner 2026-10-24: "body weight and power: optional, adults only. Teens are never asked and never shown power").
//
// THE FORMULA. Sayers et al. 1999 (MSSE 31(4):572–577), from 108 adults on a force plate:
//   peak power (W) = 60.7 × jump height (cm) + 45.3 × body mass (kg) − 2055
// Its own standard error of estimate is 355.0 W; the jump's ± adds 60.7 W per cm. Valid for adults and for a
// countermovement jump (Sayers' sample); an approach or a drop jump is not what it was fitted on, so only a CMJ is used.
//
// WHERE THE WEIGHT LIVES. Nowhere: there is no body-weight field anywhere in the app (prisma/schema.prisma has only a
// lifted load, SetLog.weightKg), and none is added. The number is typed on the page, used there, and forgotten when the
// page is left (components/jump/power-estimate.tsx). Saving it would be health data: an owner call.
//
// Pure.

/** Sayers' coefficients and its standard error of estimate (W). */
export const SAYERS = { perCm: 60.7, perKg: 45.3, intercept: -2055, seeW: 355 } as const;
/** Body masses the formula is asked about (kg): an adult's range. */
export const MASS_RANGE_KG = [35, 200] as const;

export type PowerRefusal = 'notAdult' | 'noMass' | 'massOutOfRange' | 'noJump';

/**
 * Peak power (W) and its 95 % range, or why not. `adult` is the caller's verified 18+ — anyone else is refused before
 * the mass is even looked at.
 */
export function sayersPower(o: { adult: boolean; heightCm: number | null; plusMinusCm?: number | null; massKg: number | null }):
  { ok: true; watts: number; plusMinusW: number; wattsPerKg: number } | { ok: false; why: PowerRefusal } {
  if (!o.adult) return { ok: false, why: 'notAdult' };
  if (o.heightCm === null || !(o.heightCm > 0)) return { ok: false, why: 'noJump' };
  if (o.massKg === null || !Number.isFinite(o.massKg)) return { ok: false, why: 'noMass' };
  if (o.massKg < MASS_RANGE_KG[0] || o.massKg > MASS_RANGE_KG[1]) return { ok: false, why: 'massOutOfRange' };
  const w = SAYERS.perCm * o.heightCm + SAYERS.perKg * o.massKg + SAYERS.intercept;
  const pm = Math.hypot(1.96 * SAYERS.seeW, SAYERS.perCm * (o.plusMinusCm ?? 0));
  return { ok: true, watts: Math.round(w), plusMinusW: Math.round(pm / 10) * 10, wattsPerKg: Math.round((w / o.massKg) * 10) / 10 };
}

/** Pounds → kilograms. */
export const lbToKg = (lb: number) => lb * 0.45359237;
