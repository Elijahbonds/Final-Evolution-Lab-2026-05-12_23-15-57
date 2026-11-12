// drop — the drop jump, read side-on: the step off the box, the ground contact, the rebound, RSI (JUMP-PRO 2,
// 2026-10-25; owner: "jumps it must measure best: … drop jump / RSI").
//
// WHY NOT THE JUMP CHECK. The step off a box is not a jump (the body falls, it never rises), the floor under the athlete
// at the start is the box, and the jump check's calibration stand is read there. lib/jump/rebound.ts reads RSI only
// between two real jumps. So here:
//   levels    the floor is the feet's lowest support anywhere in the clip (their low envelope); the box is where the
//             feet stood at the start, and must stand at least DROP.minBoxBh body heights over the floor
//   drop      the first time the feet reach the floor after leaving the box: its touch-down is re-timed from the falling
//             centre of mass (lib/jump/refine.ts: a body stepping off a box is in free fall until it lands)
//   rebound   the next flight off the floor whose centre of mass rises: re-timed as the approach is (centre of mass,
//             the take-off floor from the contact's own stance, several starts), its take-off-velocity height
//   contact   the rebound's take-off − the drop's touch-down, both sub-frame, with the ± of the two edges
//   RSI       lib/jump/rebound.ts rsiWithRange: height (m) ÷ contact (s), and its 95 % range
//   box       (floor − box top) in the picture × the rebound's own gravity ruler: a check the athlete can read
//
// Filmed side-on (as the approach), whole body and the box in the shot. Pure.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { footLowY } from '@/lib/assess/geometry';
import { th } from '@/lib/assess/thresholds';
import { poseHz } from '@/lib/assess/scoring';
import { comOf } from './com';
import { REFINE } from './refine';
import { APPROACH, approachPlusMinusCm, legCalibration, refineFromStarts } from './approach';
import { rsiWithRange } from './rebound';
import { trialQuality, type TrialQuality } from './session';

/** The drop reader's numbers (new, JUMP-PRO 2; measured on lib/jump/dropBench.ts). */
export const DROP = {
  /** The box stands at least this far over the floor (body heights; 0.1 ≈ 16 cm). */
  minBoxBh: 0.1,
  /** The box is read from the feet over the clip's first this long (ms). */
  boxMs: 500,
  /** A contact longer than this (ms) was a stop, not a rebound: the jump is read, RSI is not. */
  maxContactMs: 600,
  /** The drop's touch-down: a line through the lowest foot over its last this long in the air (ms; at least 2.5 frames). */
  fallFitMs: 60,
  /** The floor of the contact, from this long after the touch-down to this long before the rebound (ms). */
  floorFromMs: 30,
  /** One foot frame's noise prior (image units, ≈ 1.5 cm at 3 m), pooled into the line's error. */
  footNoise: 0.006,
  /** The line's touch-down may sit this far (ms) from the finder's first floor frame (or one frame, if longer). */
  landShiftMs: 25,
} as const;

export interface DropJump {
  valid: boolean;
  invalidWhy?: string;
  /** The step off the box, the drop's touch-down (the contact's start) and the rebound's take-off and landing (ms). */
  stepOffT: number;
  dropLandT: number;
  takeoffT: number;
  landT: number;
  /** The ground contact (ms) and its ±1 SD. */
  contactMs: number;
  contactSdMs: number;
  /** The rebound's take-off-velocity height (cm), its ±1 SD and 95 % range; the flight time. */
  heightCm: number;
  heightSdCm: number | null;
  plusMinusCm: number;
  flightMs: number;
  /** RSI (m/s) and its 95 % range; null when the contact was a stop. */
  rsi: number | null;
  rsiPlusMinus: number | null;
  /** The box's height (cm) from the picture and the rebound's gravity ruler. */
  boxCm: number | null;
  quality: TrialQuality;
}

export interface DropRead { drops: DropJump[]; poseFps: number; why?: string }

const pct = (v: number[], p: number) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const median = (v: number[]) => pct(v, 0.5);
const FEET = [27, 28, 29, 30, 31, 32];

/**
 * The drop's touch-down, sub-frame: the falling foot meets the floor fast (≈ 2–3 m/s), so a line through the lowest
 * foot over its last DROP.fallFitMs in the air, met with the floor of the contact that follows, times it to a few ms.
 * Its ±1 SD from the line's and the floor's errors over the foot's speed. Null when the fall or the contact is unseen.
 */
export function dropTouchdown(raw: readonly PoseFrame[], land0: number, reboundTo0: number, hz: number): { t: number; sd: number } | null {
  const vis = th('gate.visibility');
  const seen = (f: PoseFrame) => f.present && f.image.length >= 33 && FEET.every((k) => f.image[k].v >= REFINE.unsureVis);
  const low = (f: PoseFrame) => -Math.max(footLowY(f.image, 'left'), footLowY(f.image, 'right'));
  const w = (f: PoseFrame) => (FEET.every((k) => f.image[k].v >= vis) ? 1 : REFINE.unsureWeight);
  const fall = raw.filter((f) => seen(f) && f.t < land0 && f.t >= land0 - Math.max(DROP.fallFitMs, 2.5 * (1000 / hz)));
  const stand = raw.filter((f) => seen(f) && f.t > land0 + DROP.floorFromMs && f.t < reboundTo0 - DROP.floorFromMs);
  if (fall.length < 2 || stand.length < 1) return null;
  const W = fall.reduce((a, f) => a + w(f), 0);
  const mt = fall.reduce((a, f) => a + w(f) * f.t, 0) / W, mv = fall.reduce((a, f) => a + w(f) * low(f), 0) / W;
  const sxx = fall.reduce((a, f) => a + w(f) * (f.t - mt) ** 2, 0);
  const slope = sxx > 1e-9 ? fall.reduce((a, f) => a + w(f) * (f.t - mt) * (low(f) - mv), 0) / sxx : 0;
  if (!(slope < 0)) return null;
  const floorU = median(stand.map(low));
  const t = mt + (floorU - mv) / slope;
  // the frame the finder saw first on the floor can be a jittered one: the line may move it a little either way
  if (!(Math.abs(t - land0) <= Math.max(1000 / hz, DROP.landShiftMs))) return null;
  // the errors: each foot frame's noise (the pooled residual, or the prior) on the line at t and on the floor's median
  const res = fall.reduce((a, f) => a + w(f) * (low(f) - (mv + slope * (f.t - mt))) ** 2, 0);
  const s0 = Math.sqrt((res + 2 * DROP.footNoise ** 2) / Math.max(1, fall.length));
  const seLine = s0 * Math.sqrt(1 / W + (t - mt) ** 2 / Math.max(1e-9, sxx));
  const seFloor = (1.25 * s0) / Math.sqrt(stand.length);
  return { t, sd: Math.max(0.5, (REFINE.sdInflate * Math.hypot(seLine, seFloor)) / Math.abs(slope)) };
}

/** Every drop jump in a side-on clip (normally one). `aspect` is the picture's width ÷ height. */
export function readDrop(raw: readonly PoseFrame[], o: { aspect?: number; poseHz?: number } = {}): DropRead {
  const aspect = o.aspect ?? 4 / 3;
  const hz = o.poseHz ?? poseHz(raw);
  const none = (why: string): DropRead => ({ drops: [], poseFps: hz, why });
  const front = legCalibration(raw, aspect);
  if (!front) return none('Keep your whole body, feet too, in the shot.');
  const vis = th('gate.visibility'), bh = front.bodyHeight, air = th('t5.airLine'), contact = th('t5.contactLine');
  const fr = raw.filter((f) => f.present && f.image.length >= 33 && f.image[23].v >= vis && f.image[24].v >= vis && FEET.every((k) => f.image[k].v >= REFINE.unsureVis));
  if (fr.length < 10) return none('Keep your whole body, feet too, in the shot.');
  const lowest = fr.map((f) => Math.max(footLowY(f.image, 'left'), footLowY(f.image, 'right')));
  const env = fr.map((f) => pct(fr.flatMap((g, j) => (Math.abs(g.t - f.t) <= APPROACH.envMs ? [lowest[j]] : [])), APPROACH.envPct));
  // the floor: the lowest support anywhere; the box: where the feet stood at the start
  const floor = Math.max(...env);
  // (the same statistic as the floor's, so the landmarks' jitter does not lift one and not the other)
  const box = pct(fr.filter((f) => f.t <= fr[0].t + DROP.boxMs).map((_, i) => lowest[i]), APPROACH.envPct);
  if (!((floor - box) / bh >= DROP.minBoxBh)) return none('Start standing on the box, whole body and the box in the shot.');
  const onFloor = (i: number) => (floor - lowest[i]) / bh <= contact;
  const onBox = (i: number) => Math.abs(box - lowest[i]) / bh <= contact * 2;
  const inAir = (i: number) => (floor - lowest[i]) / bh > air;
  const comY = fr.map((f) => comOf(f.image).y);
  const drops: DropJump[] = [];
  let i = 0;
  while (i < fr.length) {
    // a stand on the box, then the first frame on the floor after it
    while (i < fr.length && !onBox(i)) i++;
    let lastBox = i;
    while (i < fr.length && !onFloor(i)) { if (onBox(i)) lastBox = i; i++; }
    if (i >= fr.length) break;
    const land = i;
    // the rebound: the next airborne run off the floor whose centre of mass rises
    let a = -1, b = -1;
    for (let j = land + 1; j < fr.length; j++) {
      if (!inAir(j) || inAir(j - 1)) continue;
      let k = j;
      while (k < fr.length && inAir(k)) k++;
      if (k >= fr.length) break;
      const top = Math.min(...comY.slice(j, k));
      if (fr[k].t - fr[j - 1].t >= th('t5.flightMinMs') && (comY[j - 1] - top) / bh >= APPROACH.minRiseBh) { a = j - 1; b = k; break; }
      // a jittered foot frame or two off the floor in the contact is not the rebound: look on, but not past a stop
      if (fr[j].t - fr[land].t > DROP.maxContactMs + 400) break;
      j = k;
    }
    if (a < 0) { i = land + 1; continue; }
    // the drop's touch-down from the falling centre of mass; the step-off is the last frame a foot was on the box
    const stepOff0 = (fr[lastBox].t + fr[Math.min(lastBox + 1, land)].t) / 2, land0 = (fr[land - 1].t + fr[land].t) / 2;
    const to0 = (fr[a].t + fr[a + 1].t) / 2, td0 = (fr[b - 1].t + fr[b].t) / 2;
    const frameSd = 1000 / hz / Math.sqrt(12);
    const td = dropTouchdown(raw, land0, to0, hz);
    const dropLandT = td ? td.t : land0;
    const dropLandSd = td ? td.sd : frameSd;
    const rf = refineFromStarts(raw, front, to0, td0, { prevLandT: dropLandT, nextTakeoffT: undefined }, { point: 'com', plantFloor: true, depthCue: 'legs', aspect, rescale: true }, hz);
    const flightMs = rf ? rf.flightMs : td0 - to0;
    const heightCm = rf ? rf.heightTovCm : ((9.81 * (flightMs / 1000) ** 2) / 8) * 100;
    const takeoffT = rf ? rf.takeoffT : to0;
    const contactMs = takeoffT - dropLandT;
    const contactSdMs = Math.hypot(dropLandSd, rf ? rf.edgeSdMs.takeoff : frameSd);
    let invalidWhy: string | undefined;
    const nominal = (front.worldHeight ?? th('t5.nominalHeightM')) / front.bodyHeight;
    if (!rf) invalidWhy = 'the camera could not time the rebound from your whole body';
    else if (flightMs > th('t5.flightMaxMs') || heightCm > th('t5.maxHeightCm')) invalidWhy = `it read over ${th('t5.maxHeightCm')} cm, so the camera lost your feet`;
    else if (!(Math.abs(rf.riseFall - 1) <= APPROACH.fall.riseFall && rf.rmsCm <= APPROACH.fall.rmsCm && Math.abs(Math.log(rf.ruler / nominal)) <= APPROACH.fall.logRuler)) invalidWhy = 'the rebound did not fall like a jump, so the camera lost you';
    else if (contactMs <= 0) invalidWhy = 'the landing and the rebound could not be told apart';
    const stop = contactMs > DROP.maxContactMs;
    const r = !invalidWhy && !stop ? rsiWithRange(heightCm, rf?.heightTovSdCm ?? 0, contactMs, contactSdMs) : null;
    drops.push({
      valid: !invalidWhy, ...(invalidWhy ? { invalidWhy } : stop ? { invalidWhy: 'you stopped on the floor before jumping, so there is no RSI: jump the moment you land' } : {}),
      stepOffT: Math.round(stepOff0), dropLandT: Math.round(dropLandT * 10) / 10,
      takeoffT: Math.round(takeoffT * 10) / 10, landT: Math.round((rf ? rf.landT : td0) * 10) / 10,
      contactMs: Math.round(contactMs), contactSdMs: Math.round(contactSdMs * 10) / 10,
      heightCm: Math.round(heightCm * 10) / 10, heightSdCm: rf ? Math.round(rf.heightTovSdCm * 10) / 10 : null,
      plusMinusCm: approachPlusMinusCm({ heightSdCm: rf ? rf.heightTovSdCm : null, flightMs }, hz), flightMs: Math.round(flightMs),
      rsi: r?.rsi ?? null, rsiPlusMinus: r?.plusMinus ?? null,
      boxCm: rf ? Math.round((floor - box) * rf.ruler * 1000) / 10 : null,
      quality: trialQuality({ refined: rf, poseHz: hz, valid: !invalidWhy }),
    });
    i = b + 1;
  }
  return drops.length ? { drops, poseFps: hz } : none('No drop jump was found. Stand on the box, step off, and jump the moment you land.');
}
