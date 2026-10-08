// jumpDetect — takeoff, landing, and two height estimates from a pose stream.
//
// The stream is the app's PoseFrame (lib/pose/landmarks.ts): image space, y down, the same frames
// PoseService delivers from the on-device model. Flight time uses the same physics as IRLCore:
//
//     h = g · t² / 8
//
// A second estimate scales the hip's rise in the picture by the height the player typed. Both are
// estimates. Centimetres are whole numbers. Confidence is low, medium, or high — never a fake percent.
//
// A hop under MIN_FLIGHT_MS is not a jump. A walk keeps one foot down, so the lower ankle never leaves
// the floor line (the same rule DunkTracker learned: the mean of the two ankles made a step look like a jump).

import { heightFromFlight, G } from '@/lib/babylon/core/IRLCore';
import {
  LEFT_ANKLE, LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER,
  RIGHT_ANKLE, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER,
} from '@/lib/pose/landmarks';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { angleDeg } from './angles';

/** Matches IRLCore MIN_FLIGHT and DunkTracker. Shorter than this is a hop. */
export const MIN_FLIGHT_MS = 180;
/** Matches IRLCore MAX_FLIGHT. Longer than this is not a believable jump. */
export const MAX_FLIGHT_MS = 1200;
/**
 * How far the lower ankle must rise, in image units, before both feet count as off the floor.
 * assumption: the same 0.03 DunkTracker uses. It is a picture threshold, not a centimetre.
 */
export const AIRBORNE_RISE = 0.03;
/** Frames of standing used to read the floor, when the stream starts on the ground. */
export const CALIB_FRAMES = 8;
/**
 * assumption: a standing hip-to-ankle span is about 0.49 of stature. Used only to scale a picture
 * into centimetres when the player has typed a height. It is not that player's measured proportion.
 */
export const HIP_ANKLE_OF_HEIGHT = 0.49;

export type Confidence = 'low' | 'medium' | 'high';
export type LandingBalance = 'steady' | 'shifting' | 'off-balance' | 'unread';

export interface JumpRead {
  takeoffMs: number;
  landingMs: number;
  flightMs: number;
  /** Whole centimetres from flight time. Null when the flight was refused. */
  airTimeCm: number | null;
  /** Whole centimetres from hip rise and the typed height. Null when there is no height, or the hip was unread. */
  hipCm: number | null;
  confidence: Confidence;
  steps: number;
  /** Metres per second along the picture, only when a height was typed. */
  approachMps: number | null;
  /** Image units per second. Not metres. */
  approachImagePerSec: number | null;
  /** Degrees above horizontal. Null when the hip barely moved, so 0 is not invented. */
  takeoffAngleDeg: number | null;
  kneeLoadDeg: number | null;
  hipLoadDeg: number | null;
  landing: LandingBalance;
}

export interface JumpOptions {
  /** The player's height in centimetres, if they typed one. */
  heightCm?: number | null;
}

interface Sample {
  t: number;
  ankle: number;
  hipX: number;
  hipY: number;
  vis: number;
  frame: PoseFrame;
}

function pt(f: PoseFrame, i: number): { x: number; y: number; v: number } | null {
  const p = f.image[i];
  if (!p || p.v < 0.5) return null;
  return p;
}

function sample(f: PoseFrame): Sample | null {
  if (!f.present) return null;
  const la = pt(f, LEFT_ANKLE);
  const ra = pt(f, RIGHT_ANKLE);
  const lh = pt(f, LEFT_HIP);
  const rh = pt(f, RIGHT_HIP);
  if (!la || !ra || !lh || !rh) return null;
  const vis = (la.v + ra.v + lh.v + rh.v) / 4;
  return {
    t: f.t,
    ankle: Math.max(la.y, ra.y),
    hipX: (lh.x + rh.x) / 2,
    hipY: (lh.y + rh.y) / 2,
    vis,
    frame: f,
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

function wholeCm(metres: number): number {
  return Math.round(metres * 100);
}

function confidenceOf(vis: number, airCm: number | null, hipCm: number | null): Confidence {
  if (airCm == null || vis < 0.5) return 'low';
  if (hipCm != null) {
    const agree = Math.abs(airCm - hipCm) / Math.max(airCm, 1);
    if (vis >= 0.8 && agree <= 0.25) return 'high';
    return vis >= 0.65 ? 'medium' : 'low';
  }
  return vis >= 0.75 ? 'medium' : 'low';
}

function minAngle(
  frames: PoseFrame[],
  a: number, b: number, c: number,
  a2: number, b2: number, c2: number,
): number | null {
  let best: number | null = null;
  for (const f of frames) {
    const p = (i: number) => pt(f, i);
    const left = p(a) && p(b) && p(c) ? angleDeg(p(a)!, p(b)!, p(c)!) : null;
    const right = p(a2) && p(b2) && p(c2) ? angleDeg(p(a2)!, p(b2)!, p(c2)!) : null;
    for (const deg of [left, right]) {
      if (deg == null) continue;
      if (best == null || deg < best) best = deg;
    }
  }
  return best == null ? null : Math.round(best);
}

/**
 * The words on a jump card. Heights say "about" and "estimate". Nothing here is called measured.
 */
export function jumpLines(j: JumpRead): string[] {
  const lines = [
    j.airTimeCm == null
      ? 'Air time: unread'
      : `About ${j.airTimeCm} cm · air time, estimate`,
    j.hipCm == null
      ? 'Hip rise: not scaled (no height entered)'
      : `About ${j.hipCm} cm · hip rise and your height, estimate`,
    `Confidence: ${j.confidence}`,
    j.approachMps == null
      ? `Approach: ${j.steps} steps${j.approachImagePerSec == null ? '' : ` · ${j.approachImagePerSec.toFixed(2)} image units/s, not metres`}`
      : `Approach: about ${j.approachMps.toFixed(1)} m/s, estimate · ${j.steps} steps`,
    j.takeoffAngleDeg == null ? 'Takeoff angle: unread' : `Takeoff angle: about ${j.takeoffAngleDeg}°, estimate`,
    j.kneeLoadDeg == null ? 'Knee at load: unread' : `Knee at load: about ${j.kneeLoadDeg}°, estimate`,
    j.hipLoadDeg == null ? 'Hip at load: unread' : `Hip at load: about ${j.hipLoadDeg}°, estimate`,
    `Landing: ${j.landing}`,
  ];
  return lines;
}

export function readJumps(frames: readonly PoseFrame[], opts: JumpOptions = {}): JumpRead[] {
  const samples: Sample[] = [];
  for (const f of frames) {
    const s = sample(f);
    if (s) samples.push(s);
  }
  if (samples.length < CALIB_FRAMES + 3) return [];

  const floor = median(samples.slice(0, CALIB_FRAMES).map((s) => s.ankle));
  const stanceHip = median(samples.slice(0, CALIB_FRAMES).map((s) => s.hipY));
  const stanceSpan = median(samples.slice(0, CALIB_FRAMES).map((s) => s.ankle - s.hipY));
  const heightCm = opts.heightCm;
  const heightM = heightCm != null && heightCm >= 80 && heightCm <= 230 ? heightCm / 100 : null;

  const jumps: JumpRead[] = [];
  let airborne = false;
  let takeoff = 0;
  let leftAt = 0;

  const close = (landing: number, flightSamples: Sample[]) => {
    const flightMs = landing - takeoff;
    airborne = false;
    if (flightMs < MIN_FLIGHT_MS || flightMs > MAX_FLIGHT_MS || flightSamples.length < 2) return;
    const airM = heightFromFlight(flightMs / 1000);
    const airTimeCm = wholeCm(airM);

    const pre = samples.filter((s) => s.t >= takeoff - 800 && s.t <= takeoff);
    const load = samples.filter((s) => s.t >= takeoff - 400 && s.t < takeoff);
    const approach = samples.filter((s) => s.t >= takeoff - 500 && s.t <= takeoff);

    let steps = 0;
    let lifted: 'L' | 'R' | null = null;
    for (const s of pre) {
      const la = pt(s.frame, LEFT_ANKLE);
      const ra = pt(s.frame, RIGHT_ANKLE);
      if (!la || !ra) continue;
      const diff = la.y - ra.y;
      const now = diff > 0.025 ? 'R' : diff < -0.025 ? 'L' : null;
      if (now && now !== lifted) {
        if (lifted) steps += 1;
        lifted = now;
      }
    }

    let approachImagePerSec: number | null = null;
    let approachMps: number | null = null;
    if (approach.length >= 2) {
      const a = approach[0];
      const b = approach[approach.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt > 0.05) {
        const travel = Math.hypot(b.hipX - a.hipX, b.hipY - a.hipY);
        approachImagePerSec = Math.round((travel / dt) * 100) / 100;
        if (heightM && stanceSpan > 0.02) {
          const metresPerUnit = (heightM * HIP_ANKLE_OF_HEIGHT) / stanceSpan;
          approachMps = Math.round((travel * metresPerUnit / dt) * 10) / 10;
        }
      }
    }

    let takeoffAngleDeg: number | null = null;
    // From just before the feet leave to just after, so a held crouch (no hip travel) does not become 0°.
    const angleFrom = samples.filter((s) => s.t >= takeoff - 40 && s.t <= takeoff + 120);
    if (angleFrom.length >= 2) {
      const a = angleFrom[0];
      const b = angleFrom[angleFrom.length - 1];
      const up = -(b.hipY - a.hipY);
      const horiz = Math.abs(b.hipX - a.hipX);
      if (Math.hypot(up, horiz) >= 0.01) {
        takeoffAngleDeg = Math.round((Math.atan2(up, horiz) * 180) / Math.PI);
      }
    }

    const loadFrames = load.map((s) => s.frame);
    const kneeLoadDeg = minAngle(loadFrames, LEFT_HIP, LEFT_KNEE, LEFT_ANKLE, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE);
    const hipLoadDeg = minAngle(loadFrames, LEFT_SHOULDER, LEFT_HIP, LEFT_KNEE, RIGHT_SHOULDER, RIGHT_HIP, RIGHT_KNEE);

    const apex = flightSamples.reduce((m, s) => Math.min(m, s.hipY), Infinity);
    const rise = stanceHip - apex;
    let hipCm: number | null = null;
    if (heightM && stanceSpan > 0.02 && rise > 0.005) {
      const metresPerUnit = (heightM * HIP_ANKLE_OF_HEIGHT) / stanceSpan;
      hipCm = wholeCm(rise * metresPerUnit);
    }

    const post = samples.filter((s) => s.t >= landing && s.t <= landing + 400);
    let landingBalance: LandingBalance = 'unread';
    if (post.length >= 2) {
      let sway = 0;
      for (let i = 1; i < post.length; i++) {
        sway += Math.hypot(post[i].hipX - post[i - 1].hipX, post[i].hipY - post[i - 1].hipY);
      }
      landingBalance = sway < 0.03 ? 'steady' : sway < 0.08 ? 'shifting' : 'off-balance';
    }

    const vis = flightSamples.reduce((m, s) => m + s.vis, 0) / flightSamples.length;
    jumps.push({
      takeoffMs: Math.round(takeoff),
      landingMs: Math.round(landing),
      flightMs: Math.round(flightMs),
      airTimeCm,
      hipCm,
      confidence: confidenceOf(vis, airTimeCm, hipCm),
      steps,
      approachMps,
      approachImagePerSec,
      takeoffAngleDeg,
      kneeLoadDeg,
      hipLoadDeg,
      landing: landingBalance,
    });
  };

  let flightSamples: Sample[] = [];
  for (let i = CALIB_FRAMES; i < samples.length; i++) {
    const s = samples[i];
    const off = s.ankle < floor - AIRBORNE_RISE;
    if (!airborne && off) {
      airborne = true;
      takeoff = s.t;
      leftAt = s.t;
      flightSamples = [s];
    } else if (airborne && off) {
      flightSamples.push(s);
    } else if (airborne && !off) {
      close(s.t, flightSamples);
      flightSamples = [];
    } else if (airborne && s.t - leftAt > MAX_FLIGHT_MS + 400) {
      airborne = false;
      flightSamples = [];
    }
  }
  return jumps;
}

/** Exposed so the flight-time test can show the formula without going through a pose stream. */
export { heightFromFlight, G };
