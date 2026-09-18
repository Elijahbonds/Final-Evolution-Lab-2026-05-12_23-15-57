// dunk-finder — WHICH DUNK IS WHICH in the owner's DeepMotion takes (owner, 2026-09-18: "try to actually use some mocap
// dunk clips and place them right … identify what dunk is what and add them").
//
// A take is scanned for REACH-UPS (a hand ≥ REACH torso-lengths above the hips); each reach-up is read in body terms in
// the 0.8 s before its peak and 0.4 s after:
//   two_hand   both hands up and together at the peak (a two-hand flush)
//   tomahawk   the flush hand cocks BEHIND the head on the way up
//   windmill   the flush hand sweeps ≥ 240° around its shoulder in the side plane before the peak
//   cradle     both hands together and LOW (the ball rocked at the hip) inside the half second before a one-hand peak
//   reverse    the body turns ≥ 110° through the window (its back to the target); spin ≥ 300° is a 360
//   one_hand   none of the above: a plain one-hand flush (right or left)
// plus the JUMP (the feet leaving the take's floor) and where the flush hand is at the peak (in front / over the head).
//
//   npx tsx scripts/mocap/dunk-finder.mts <take.bvh> [...]   (JSON to /tmp/dunk-finder.json)
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readBvhStream, type JointStream } from './sources.mts';

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
const UP: V3 = [0, 1, 0];

/** A reach-up: a hand this many torso lengths above the hips (a hand straight overhead is ~1.9). */
const REACH = 1.45;
const BEFORE_SEC = 0.8, AFTER_SEC = 0.4;

interface Event {
  take: string; file: string; peakT: number; from: number; to: number;
  kind: string; hand: 'right' | 'left' | 'both';
  handHiL: number; handHiR: number; together: number;   // torso lengths above the hips at the peak; hands' gap
  frontAtPeak: number;   // flush hand's forward offset from the head at the peak (torso lengths; + in front)
  yawDeg: number; sweepDeg: number; cockBack: number; jump: number; cradle: boolean;
}

function frameAxes(fr: JointStream['frames'][number], frontSign: number) {
  const right = norm([fr.RightUpLeg[0] - fr.LeftUpLeg[0], 0, fr.RightUpLeg[2] - fr.LeftUpLeg[2]]);
  const front = norm(cross(right, UP)); front[0] *= frontSign; front[2] *= frontSign;
  return { right, front };
}
function frontSignOf(s: JointStream, f0: number, f1: number): number {
  const votes: number[] = [];
  for (let f = f0; f <= f1; f++) {
    const fr = s.frames[f]; const { front } = frameAxes(fr, 1);
    const toe: V3 = [fr.LeftToe[0] - fr.LeftFoot[0] + fr.RightToe[0] - fr.RightFoot[0], 0, fr.LeftToe[2] - fr.LeftFoot[2] + fr.RightToe[2] - fr.RightFoot[2]];
    votes.push(Math.sign(dot(toe, front)) || 1);
  }
  return median(votes) >= 0 ? 1 : -1;
}
const yawOf = (fr: JointStream['frames'][number]) => Math.atan2(fr.RightUpLeg[0] - fr.LeftUpLeg[0], fr.RightUpLeg[2] - fr.LeftUpLeg[2]);
const unwrap = (a: number, ref: number) => { let d = a - ref; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return ref + d; };

function analyse(file: string): Event[] {
  const s = readBvhStream(file, 'deepmotion');
  const n = s.frames.length, fps = s.fps;
  const T = median(s.frames.map((fr) => len(sub(fr.Head, fr.Hips))));   // torso length, raw units
  const floor = Math.min(...s.frames.map((fr) => Math.min(fr.LeftFoot[1], fr.RightFoot[1])));
  const sign = frontSignOf(s, 0, n - 1);
  const hi = (fr: JointStream['frames'][number], h: 'LeftHand' | 'RightHand') => (fr[h][1] - fr.Hips[1]) / T;
  // reach-up frames → events (gaps under 0.4 s merge)
  const events: Event[] = [];
  let f = 0;
  while (f < n) {
    if (Math.max(hi(s.frames[f], 'LeftHand'), hi(s.frames[f], 'RightHand')) < REACH) { f++; continue; }
    let end = f, gap = 0;
    for (let g = f; g < n; g++) {
      if (Math.max(hi(s.frames[g], 'LeftHand'), hi(s.frames[g], 'RightHand')) >= REACH) { end = g; gap = 0; } else if (++gap > 0.4 * fps) break;
    }
    // the peak
    let peak = f, best = -1;
    for (let g = f; g <= end; g++) { const v = Math.max(hi(s.frames[g], 'LeftHand'), hi(s.frames[g], 'RightHand')); if (v > best) { best = v; peak = g; } }
    const from = Math.max(0, peak - Math.round(BEFORE_SEC * fps)), to = Math.min(n - 1, peak + Math.round(AFTER_SEC * fps));
    const pf = s.frames[peak];
    const L = hi(pf, 'LeftHand'), R = hi(pf, 'RightHand');
    const together = len(sub(pf.LeftHand, pf.RightHand)) / T;
    const hand: Event['hand'] = together < 0.55 && Math.min(L, R) >= 1.3 ? 'both' : R >= L ? 'right' : 'left';
    const H = hand === 'left' ? 'LeftHand' : 'RightHand', S = hand === 'left' ? 'LeftArm' : 'RightArm';
    const { front } = frameAxes(pf, sign);
    const frontAtPeak = dot(sub(pf[H], pf.Head), front) / T;
    // the turn through the window
    let yaw0 = yawOf(s.frames[from]), yawAcc = yaw0, yawMin = 0, yawMax = 0;
    for (let g = from + 1; g <= to; g++) { yawAcc = unwrap(yawOf(s.frames[g]), yawAcc); yawMin = Math.min(yawMin, yawAcc - yaw0); yawMax = Math.max(yawMax, yawAcc - yaw0); }
    const yawDeg = Math.round(Math.max(Math.abs(yawMin), Math.abs(yawMax)) * 180 / Math.PI);
    // the flush hand's sweep about its shoulder in the side (front, up) plane before the peak
    let sweep = 0, prevA: number | null = null, cockBack = 0, cradle = false;
    for (let g = from; g <= peak; g++) {
      const fr = s.frames[g]; const { front: fr_ } = frameAxes(fr, sign);
      const v = sub(fr[H], fr[S]); const a = Math.atan2(dot(v, UP), dot(v, fr_));
      if (prevA !== null) { let d = a - prevA; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; sweep += d; }
      prevA = a;
      const behind = -dot(sub(fr[H], fr.Head), fr_) / T;   // + when the hand is behind the head
      if (fr[H][1] > fr.Head[1] - 0.15 * T && g >= peak - Math.round(0.5 * fps)) cockBack = Math.max(cockBack, behind);
      const gapHands = len(sub(fr.LeftHand, fr.RightHand)) / T, lowHand = Math.max(hi(fr, 'LeftHand'), hi(fr, 'RightHand'));
      if (g >= peak - Math.round(0.5 * fps) && gapHands < 0.5 && lowHand < 0.6) cradle = true;
    }
    const sweepDeg = Math.round(Math.abs(sweep) * 180 / Math.PI);
    let jump = 0; for (let g = from; g <= to; g++) jump = Math.max(jump, (Math.min(s.frames[g].LeftFoot[1], s.frames[g].RightFoot[1]) - floor) / T);
    let kind: string;
    if (yawDeg >= 300) kind = 'spin_360';
    else if (yawDeg >= 110) kind = 'reverse';
    else if (hand === 'both') kind = 'two_hand';
    else if (sweepDeg >= 240) kind = 'windmill';
    else if (cockBack >= 0.25) kind = 'tomahawk';
    else if (cradle) kind = 'cradle';
    else kind = 'one_hand';
    events.push({ take: basename(file).replace(/_customModel.*$/, '').replace(/\.bvh$/, ''), file, peakT: +(peak / fps).toFixed(2), from: +(from / fps).toFixed(2), to: +(to / fps).toFixed(2),
      kind, hand, handHiL: +L.toFixed(2), handHiR: +R.toFixed(2), together: +together.toFixed(2), frontAtPeak: +frontAtPeak.toFixed(2), yawDeg, sweepDeg, cockBack: +cockBack.toFixed(2), jump: +jump.toFixed(2), cradle });
    f = end + 1;
  }
  return events;
}

const all: Event[] = [];
for (const file of process.argv.slice(2)) {
  try { all.push(...analyse(file)); } catch (e) { console.error(`${basename(file)}: ${(e as Error).message}`); }
}
console.log(`take                       peak   kind       hand   L     R     gap   front  yaw  sweep  cock  jump`);
for (const e of all) console.log(`${e.take.padEnd(26)} ${String(e.peakT).padStart(6)}  ${e.kind.padEnd(9)}  ${e.hand.padEnd(5)}  ${e.handHiL.toFixed(2)}  ${e.handHiR.toFixed(2)}  ${e.together.toFixed(2)}  ${String(e.frontAtPeak.toFixed(2)).padStart(5)}  ${String(e.yawDeg).padStart(3)}  ${String(e.sweepDeg).padStart(5)}  ${e.cockBack.toFixed(2)}  ${e.jump.toFixed(2)}`);
const counts: Record<string, number> = {}; for (const e of all) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
console.log(`\n${all.length} reach-ups:`, counts);
writeFileSync('/tmp/dunk-finder.json', JSON.stringify(all, null, 1));
