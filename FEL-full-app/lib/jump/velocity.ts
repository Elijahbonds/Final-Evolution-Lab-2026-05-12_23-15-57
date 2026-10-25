// velocity — a jump's take-off velocity, push-off, RSI-mod, and (for an adult who types a body weight) its power and a
// simple force-velocity profile (JUMP-TESTS, owner scope addition 2026-10-25: "jump velocity & power"). EVERY NUMBER
// HERE IS AN ESTIMATE, labelled so wherever it is shown; none is checked against a force plate until the pilot
// (docs/JUMP-PILOT-PROTOCOL.md).
//
// FROM WHAT THE READERS ALREADY HAVE:
//   v0            the take-off velocity, √(2·g·h) of the take-off-velocity height (refine.ts heightTovCm, the force
//                 plate's definition, run backwards). Its ± is g·σh/v0. Needs no frames: the live check has it too.
//   push-off      how far the hips rose from the bottom of the dip to the take-off (cm), on the video's frames,
//                 through the body's own scale (as slowmo.ts reads it): Samozino's hpo is measured at the hip
//   time to take-off and RSI-mod (countermovement jumps only)
//                 from the first frame the centre of mass sits jump.onsetCm under its standing level to the take-off;
//                 RSI-mod = height (m) ÷ that time (s)
//   mean propulsive velocity  v0 / 2 (Samozino 2008: the push-off from rest to v0 at a constant force)
// WITH A BODY WEIGHT (typed by an adult, never kept; lib/jump/power.ts's rule — kids and teens are never asked):
//   peak power    Sayers 1999 (power.ts)
//   mean propulsive force and power   Samozino 2008: F̄ = m·g·(h/hpo + 1), P̄ = F̄·√(g·h/2), with the mass moved
//                 (body + any load)
//   F-v profile   two or more loads: the line through (v̄, F̄) per jump, F0 at v = 0, V0 at F = 0, Pmax = F0·V0/4
// assumption: (owner call) without a body weight no power is shown in any form, W/kg included — only v0, the push-off,
// time to take-off and RSI-mod. A Samozino W/kg needs no weight and would be one line to show (relativeMeanPower).
//
// Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { FrontCalibration } from '@/lib/assess/calibration';
import { th } from '@/lib/assess/thresholds';
import { comTrack } from './protocols';
import { jr } from './PROPOSED-jump';
import { MASS_RANGE_KG, sayersPower } from './power';

export const G = 9.81;

export interface JumpKinematics {
  /** Take-off velocity (m/s) and its ±1 SD. */
  v0Mps: number;
  v0SdMps: number | null;
  /** Mean propulsive velocity (m/s): v0 / 2. */
  meanVelMps: number;
  /** The hips' rise from the bottom of the dip to the take-off (cm); null without frames or out of range. */
  pushOffCm: number | null;
  /** From the start of the countermovement to the take-off (ms), and height ÷ that time (countermovement jumps only). */
  timeToTakeoffMs: number | null;
  rsiMod: number | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };

/** v0 = √(2·g·h) from a height in cm, and its ±1 SD from the height's. */
export function takeoffVelocity(heightCm: number, heightSdCm?: number | null): { v0Mps: number; v0SdMps: number | null } {
  const v0 = Math.sqrt(2 * G * Math.max(0, heightCm) / 100);
  return { v0Mps: r2(v0), v0SdMps: heightSdCm != null && v0 > 0 ? Math.round((G * (heightSdCm / 100) / v0) * 1000) / 1000 : null };
}

/**
 * The bottom of the dip, the push-off and (with `countermovement`) the time to take-off, from the video's frames. The
 * standing level is the centre of mass's median over the stand 0.7–1.5 s before the bottom (the steps ask for a still
 * stand); a jump straight out of a rebound has no stand and gets no time to take-off.
 */
export function pushOffOf(frames: readonly PoseFrame[], front: FrontCalibration, takeoffT: number, o: { countermovement: boolean }):
  { pushOffCm: number | null; bottomT: number | null; timeToTakeoffMs: number | null } {
  const mpu = (front.worldHeight ?? th('t5.nominalHeightM')) / front.bodyHeight;
  const tr = comTrack(frames, takeoffT - 2500, takeoffT);
  // the hips read a little past the take-off too, so the smoothing at the take-off is centred (one-sided, it read the
  // rising hips ~5 cm low on the bench)
  const hips = comTrack(frames, takeoffT - 1000, takeoffT + 60, 40, 'hips');
  const near = hips.filter((p) => p.t <= takeoffT);
  if (near.length < 4) return { pushOffCm: null, bottomT: null, timeToTakeoffMs: null };
  const bottom = near.reduce((a, p) => (p.u < a.u ? p : a));
  const top = near[near.length - 1];
  const cm = (top.u - bottom.u) * mpu * 100;
  const lo = jr('jump.pushOffRangeCm');
  const pushOffCm = cm >= lo && cm <= 7 * lo ? Math.round(cm * 10) / 10 : null;
  let timeToTakeoffMs: number | null = null;
  if (o.countermovement) {
    const nearCom = tr.filter((p) => p.t >= takeoffT - 1000);
    const bottomCom = nearCom.length ? nearCom.reduce((a, p) => (p.u < a.u ? p : a)) : bottom;
    const stand = tr.filter((p) => p.t >= bottomCom.t - 1500 && p.t <= bottomCom.t - 700).map((p) => p.u);
    if (stand.length >= 3) {
      const level = median(stand), line = level - jr('jump.onsetCm') / 100 / mpu;
      let onset: number | null = null;
      for (const p of tr) if (p.t < bottomCom.t && p.u >= line) onset = p.t;
      const ms = onset === null ? null : takeoffT - onset;
      timeToTakeoffMs = ms !== null && ms >= 250 && ms <= 2000 ? Math.round(ms) : null;
    }
  }
  return { pushOffCm, bottomT: bottom.t, timeToTakeoffMs };
}

/** Every number a jump gives without a body weight. `frames` / `front` absent (the live check keeps no frames): v0 only. */
export function jumpKinematics(
  jump: { takeoffT: number; heightCm: number; heightSdCm?: number | null },
  o: { frames?: readonly PoseFrame[] | null; front?: FrontCalibration | null; countermovement: boolean },
): JumpKinematics {
  const v = takeoffVelocity(jump.heightCm, jump.heightSdCm);
  const p = o.frames && o.front ? pushOffOf(o.frames, o.front, jump.takeoffT, { countermovement: o.countermovement }) : null;
  const ttt = p?.timeToTakeoffMs ?? null;
  return {
    ...v, meanVelMps: r2(v.v0Mps / 2), pushOffCm: p?.pushOffCm ?? null, timeToTakeoffMs: ttt,
    rsiMod: ttt ? r2(jump.heightCm / 100 / (ttt / 1000)) : null,
  };
}

// ── with a body weight: adults only ──────────────────────────────────────────────────────────────────────────────

export type MassRefusal = 'notAdult' | 'noMass' | 'massOutOfRange';
const massCheck = (adult: boolean, massKg: number | null): MassRefusal | null =>
  !adult ? 'notAdult' : massKg === null || !Number.isFinite(massKg) ? 'noMass' : massKg < MASS_RANGE_KG[0] || massKg > MASS_RANGE_KG[1] ? 'massOutOfRange' : null;

/** Samozino's mean force per kg moved (N/kg) and mean propulsive velocity: g·(h/hpo + 1), √(g·h/2). */
function perKg(heightCm: number, pushOffCm: number): { fPerKg: number; vMean: number } {
  const h = heightCm / 100, hpo = pushOffCm / 100;
  return { fPerKg: G * (h / hpo + 1), vMean: Math.sqrt((G * h) / 2) };
}

/** Samozino's mean propulsive power per kg moved (W/kg): needs no weight. Not shown today (see the header). */
export const relativeMeanPower = (heightCm: number, pushOffCm: number) => { const k = perKg(heightCm, pushOffCm); return r2(k.fPerKg * k.vMean); };

export interface JumpPower {
  /** Sayers peak power (W) and its 95 % range. */
  peakW: number;
  peakPlusMinusW: number;
  /** Samozino mean propulsive force (N) and power (W), null without a push-off. */
  meanForceN: number | null;
  meanPowerW: number | null;
  /** Per kg of body weight. */
  peakWPerKg: number;
  meanWPerKg: number | null;
}

/**
 * One jump's power for an adult who typed a body weight. Refused for anyone else before the weight is looked at. The
 * Sayers formula is a countermovement jump's (power.ts): `kind` other than 'cmj' gets the Samozino numbers only.
 */
export function jumpPower(o: { adult: boolean; massKg: number | null; loadKg?: number; heightCm: number; plusMinusCm?: number | null; pushOffCm: number | null; kind: 'cmj' | 'other' }):
  { ok: true; p: JumpPower | null; mean: { forceN: number; powerW: number } | null } | { ok: false; why: MassRefusal } {
  const why = massCheck(o.adult, o.massKg);
  if (why) return { ok: false, why };
  const m = o.massKg!, moved = m + Math.max(0, o.loadKg ?? 0);
  const mean = o.pushOffCm ? (() => { const k = perKg(o.heightCm, o.pushOffCm); return { forceN: Math.round(moved * k.fPerKg), powerW: Math.round(moved * k.fPerKg * k.vMean) }; })() : null;
  if (o.kind !== 'cmj' || (o.loadKg ?? 0) > 0) return { ok: true, p: null, mean };
  const s = sayersPower({ adult: o.adult, heightCm: o.heightCm, plusMinusCm: o.plusMinusCm ?? null, massKg: m });
  if (!s.ok) return { ok: true, p: null, mean };
  return {
    ok: true, mean,
    p: { peakW: s.watts, peakPlusMinusW: s.plusMinusW, peakWPerKg: s.wattsPerKg, meanForceN: mean?.forceN ?? null, meanPowerW: mean?.powerW ?? null, meanWPerKg: mean ? r2(mean.powerW / m) : null },
  };
}

export interface FvPoint { loadKg: number; heightCm: number; pushOffCm: number }
export interface FvProfile {
  /** Theoretical maximal force (N) and velocity (m/s), the maximal power (W), and per kg of body weight. */
  f0N: number; v0Mps: number; pmaxW: number;
  f0PerKg: number; pmaxPerKg: number;
  /** The profile's slope (N·s/m per kg; negative). */
  sfvPerKg: number;
  /** How well the line fits (r²), points and distinct loads used. */
  r2: number; n: number; loads: number;
}
export type FvRefusal = MassRefusal | 'tooFew' | 'oneLoad' | 'notFv';

/**
 * Samozino's simple method: each jump's mean force and velocity with the mass it moved, a straight line through them,
 * F0 where v = 0, V0 where F = 0, Pmax = F0·V0/4. Needs two loads or more (one jump each, at least); a line that does
 * not fall with speed is not a force-velocity profile and is refused.
 */
export function fvProfile(o: { adult: boolean; massKg: number | null; points: readonly FvPoint[] }): { ok: true; fv: FvProfile } | { ok: false; why: FvRefusal } {
  const why = massCheck(o.adult, o.massKg);
  if (why) return { ok: false, why };
  const m = o.massKg!;
  const pts = o.points.filter((p) => p.heightCm > 0 && p.pushOffCm > 0 && p.loadKg >= 0).map((p) => {
    const k = perKg(p.heightCm, p.pushOffCm);
    return { v: k.vMean, f: (m + p.loadKg) * k.fPerKg, load: p.loadKg };
  });
  if (pts.length < 2) return { ok: false, why: 'tooFew' };
  const loads = new Set(pts.map((p) => Math.round(p.load * 2) / 2)).size;
  if (loads < 2) return { ok: false, why: 'oneLoad' };
  const n = pts.length, mv = pts.reduce((a, p) => a + p.v, 0) / n, mf = pts.reduce((a, p) => a + p.f, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.v - mv) ** 2, 0), sxy = pts.reduce((a, p) => a + (p.v - mv) * (p.f - mf), 0);
  const syy = pts.reduce((a, p) => a + (p.f - mf) ** 2, 0);
  if (!(sxx > 0)) return { ok: false, why: 'oneLoad' };
  const slope = sxy / sxx, f0 = mf - slope * mv;
  if (!(slope < 0) || !(f0 > 0)) return { ok: false, why: 'notFv' };
  const v0 = -f0 / slope;
  return {
    ok: true,
    fv: {
      f0N: Math.round(f0), v0Mps: r2(v0), pmaxW: Math.round((f0 * v0) / 4),
      f0PerKg: r2(f0 / m), pmaxPerKg: r2((f0 * v0) / 4 / m), sfvPerKg: r2(slope / m),
      r2: syy > 0 ? r2((sxy * sxy) / (sxx * syy)) : 1, n, loads,
    },
  };
}
