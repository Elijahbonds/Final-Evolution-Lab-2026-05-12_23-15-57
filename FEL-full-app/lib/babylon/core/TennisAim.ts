// TennisAim — the Wii Sports Tennis read (owner, 2026-09-18: "football, tennis and soccer upgrades next").
//
// Wii Tennis has no aim stick: WHEN you swing is WHERE the ball goes — early pulls it across your body, late pushes it
// the other way, and a player reads the far court through that. This mode already grades timing (RallyCore.gradeSwing)
// and takes a stick aim; the timing now bends the aim the Wii way, a LANDING RING on the far court shows where the
// shot would drop for the stick you are holding, and the timing meter draws its bands as lines. Weather drifts the
// flight (a crosswind moves the landing), capped in WeatherKit, shown before you commit.

import { SWING_BANDS, planShot, type RallyConfig, type SwingQuality, type TennisShot, type Vec3 } from './RallyCore';

/** A full early / late (at the edge of the OK band) pushes the aim this far across the court (−1..1 aim units). */
export const TIMING_AIM = 0.55;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The timing's share of the aim: early (negative dt) pulls left, late pushes right. Perfect timing bends nothing. */
export function timingAimOffset(dtSec: number): number {
  const a = Math.abs(dtSec);
  if (a <= SWING_BANDS.perfect) return 0;
  return clamp(dtSec / SWING_BANDS.ok, -1, 1) * TIMING_AIM;
}
/** Stick + timing → the aim the shot is planned on. */
export function aimFor(stickX: number, dtSec: number): number { return clamp(stickX + timingAimOffset(dtSec), -1, 1); }

/** Where the shot the player is holding would land (for the ring): the plan, assuming the timing they are about to make. */
export function landingFor(cfg: RallyConfig, from: Vec3, toSide: -1 | 1, aimX: number, shot: TennisShot | undefined, quality: SwingQuality = 'perfect'): { x: number; z: number } | null {
  const p = planShot(cfg, from, toSide, aimX, quality, undefined, shot);
  return p ? { x: p.to.x, z: p.to.z } : null;
}

/** Weather: a crosswind drifts a flight sideways, more the longer it hangs. Capped so a lob stays a lob. */
export const WIND_DRIFT_K = 0.35, WIND_DRIFT_MAX = 1.2;
export function windDrift(wind: { x: number; z: number }, durationSec: number): { x: number; z: number } {
  const x = clamp(wind.x * WIND_DRIFT_K * durationSec, -WIND_DRIFT_MAX, WIND_DRIFT_MAX);
  const z = clamp(wind.z * WIND_DRIFT_K * durationSec * 0.5, -WIND_DRIFT_MAX * 0.5, WIND_DRIFT_MAX * 0.5);
  return { x, z };
}

/** The timing meter's bands, in meter units (0 = the window opens at 55 % of the flight, 1 = ideal contact): where PERFECT,
 *  GOOD and EARLY/LATE begin for a flight of this duration. Numbers may fall below 0 on a slow ball — the HUD clamps. */
export function meterBandsFor(durationSec: number): { perfectFrom: number; goodFrom: number; okFrom: number } {
  const span = Math.max(0.05, 0.45 * durationSec);   // seconds the meter covers
  return { perfectFrom: 1 - SWING_BANDS.perfect / span, goodFrom: 1 - SWING_BANDS.good / span, okFrom: 1 - SWING_BANDS.ok / span };
}
