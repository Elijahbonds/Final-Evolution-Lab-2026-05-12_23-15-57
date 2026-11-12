// lib/vbt/bench.ts — VBT (2026-10-25): synthetic sets with KNOWN bar speed, filmed side-on, for the tests and the rig.
//
// WHY A BENCH. The owner's rule: no accuracy claim before a validation pilot. Until then the tracker is held to the
// bench: a bar path whose every rep's MCV, PV and range are known exactly, "filmed" at 30, 60 or 240 fps with the
// camera's real faults — uneven frame times, dropped frames, landmark jitter (POSE_JITTER-sized), a fitted plate's
// jitter — and read back through the same code a phone runs. The bench measures the CAMERA AND THE CODE, never the body:
// a real hand is not a bar and a real body's proportions are not the table's (those are the ± bands' other terms).
//
// THE PATH. Each rep: a lowering (half-cosine over eccMs), a bottom pause, a concentric whose speed is a half-sine
// (optionally with a sticking-point dip), a lockout hold. A deadlift starts on the floor (no lowering before rep 1).
// THE BODY. A side-on skeleton whose shoulder→hip→knee→ankle keeps the Drillis–Contini share of the athlete's height in
// every frame (a squat bends it by two-link IK, a push-up or pull-up moves it whole), so the pose ruler is exact here.
// THE PLATE. Nearer the lens than the body (depthRatio), so its own ruler differs from the body's — as on a phone.
//
// Pure (seeded).
import { LANDMARK_COUNT, LEFT_ANKLE, LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, LEFT_WRIST, NOSE, RIGHT_ANKLE, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER, RIGHT_WRIST, type Lm } from '@/lib/pose/landmarks';
import type { Lift } from './lifts';
import { PLATE_DIAMETER_M, SEGMENT_STATURE_SHARE } from './thresholds';
import type { VbtFrame } from './track';

export interface BenchRep { romM: number; concMs: number; eccMs?: number; pauseMs?: number; topMs?: number; stick?: number }
export interface TruthRep { startT: number; endT: number; romM: number; mcv: number; pv: number }
export interface SetSpec { reps: BenchRep[]; leadMs?: number; tailMs?: number; fromFloor?: boolean }

export { rng } from './rng';
import { rng } from './rng';

/** The concentric's speed shape on τ ∈ [0, 1]: a half-sine, with an optional sticking-point dip. */
const shape = (tau: number, stick: number) => Math.sin(Math.PI * tau) * (1 - stick * Math.exp(-(((tau - 0.45) / 0.09) ** 2)));

/** A set's bar height (m, up from the bottom of rep 1) as a function of time (ms), and every rep's truth. */
export function buildPath(spec: SetSpec): { y: (t: number) => number; reps: TruthRep[]; durationMs: number } {
  type Seg = { t0: number; t1: number; f: (t: number) => number };
  const segs: Seg[] = [];
  const truth: TruthRep[] = [];
  let t = spec.leadMs ?? 800;
  let top = spec.fromFloor ? 0 : spec.reps[0]?.romM ?? 0;
  { const y0 = top; segs.push({ t0: 0, t1: t, f: () => y0 }); }
  for (const [i, r] of spec.reps.entries()) {
    const ecc = spec.fromFloor && i === 0 ? 0 : (r.eccMs ?? 900);
    const bottom = top - (spec.fromFloor && i === 0 ? 0 : r.romM);
    if (ecc > 0) {
      const t0 = t, a = top, b = bottom;
      segs.push({ t0, t1: t0 + ecc, f: (x) => b + (a - b) * (0.5 + 0.5 * Math.cos((Math.PI * (x - t0)) / ecc)) });
      t += ecc;
    }
    const pause = r.pauseMs ?? 150;
    { const t0 = t; segs.push({ t0, t1: t0 + pause, f: () => bottom }); t += pause; }
    // the concentric: integrate the shape numerically, normalised to the range
    const N = 400, stick = r.stick ?? 0;
    const cum = [0];
    for (let k = 1; k <= N; k++) cum.push(cum[k - 1] + shape((k - 0.5) / N, stick));
    const total = cum[N];
    const t0 = t, T = r.concMs, rom = r.romM, b0 = bottom;
    segs.push({ t0, t1: t0 + T, f: (x) => { const q = Math.min(N, Math.max(0, ((x - t0) / T) * N)); const k = Math.floor(q); const fr = q - k; const c = k >= N ? total : cum[k] + fr * (cum[k + 1] - cum[k]); return b0 + (rom * c) / total; } });
    let peak = 0;
    for (let k = 0; k <= N; k++) peak = Math.max(peak, shape(k / N, stick));
    const mcv = rom / (T / 1000);
    truth.push({ startT: t0, endT: t0 + T, romM: rom, mcv, pv: (peak * rom) / ((total / N) * (T / 1000)) });
    t += T;
    top = bottom + rom;
    const hold = r.topMs ?? 400;
    { const t1 = t, yTop = top; segs.push({ t0: t1, t1: t1 + hold, f: () => yTop }); t += hold; }
  }
  const end = t + (spec.tailMs ?? 600);
  { const yEnd = top; segs.push({ t0: t, t1: end, f: () => yEnd }); }
  const y = (x: number) => { if (x < 0) return segs[0].f(0); for (const s of segs) if (x >= s.t0 && x < s.t1) return s.f(x); return segs[segs.length - 1].f(x); };
  return { y, reps: truth, durationMs: end };
}

export interface FilmOpts {
  fps: number;
  seed?: number;
  /** Athlete height (m), image heights per metre of the body plane, and the plate's depth ratio (body ÷ plate distance). */
  heightM?: number;
  unitsPerM?: number;
  depthRatio?: number;
  aspect?: number;
  /** Jitter (image heights, 1 SD) of a landmark and of a fitted plate centre; frame-time jitter (ms); drop share. */
  poseSd?: number;
  plateSd?: number;
  timeJitterMs?: number;
  dropShare?: number;
  /** Is a plate seen (true for a barbell filmed with its plate in shot)? */
  plate?: boolean;
}

const lm = (x: number, y: number, v = 0.95): Lm => ({ x, y, z: 0, v });

/**
 * Film a set side-on: one VbtFrame per camera frame. The lift decides what moves — a bar (the hands, and the hips for a
 * squat), the hips (a bodyweight squat), the whole body (a push-up or pull-up).
 */
export function filmSet(lift: Lift, spec: SetSpec, o: FilmOpts): { frames: VbtFrame[]; truth: TruthRep[]; aspect: number; heightM: number } {
  const { y, reps, durationMs } = buildPath(spec);
  const R = rng(o.seed ?? 1);
  const H = o.heightM ?? 1.78, k = o.unitsPerM ?? 0.42, aspect = o.aspect ?? 9 / 16, depth = o.depthRatio ?? 1.28;
  const poseSd = o.poseSd ?? 0.004, plateSd = o.plateSd ?? 0.0012, tj = o.timeJitterMs ?? 1.5, drop = o.dropShare ?? 0.02;
  const seg = SEGMENT_STATURE_SHARE * H;
  const L1 = seg * (0.288 / 0.779), L2 = seg * (0.245 / 0.779), L3 = seg * (0.246 / 0.779);   // trunk, thigh, shank (m)
  // the body plane: ankle at image (0.45 W, 0.9 H); x in image heights (× aspect of the width)
  const ax = 0.45 * aspect, ay = 0.9;
  const frames: VbtFrame[] = [];
  const dt = 1000 / o.fps;
  const squatty = lift.point === 'hip' || lift.id === 'back_squat' || lift.id === 'front_squat' || lift.id === 'goblet_squat';
  const rigid = lift.id === 'push_up' || lift.id === 'pull_up';
  const top = Math.max(...reps.map((r) => r.romM), 0.01);
  for (let i = 0; i * dt < durationMs; i++) {
    if (R.u() < drop) continue;
    const t = i * dt + R.n() * tj;
    const disp = y(t) - top;                     // ≤ 0: how far under the set's top the moving point is (m)
    // the skeleton in metres from the ankle (x forward, y up)
    let hipY = L2 + L3, hipX = 0, kneeX = 0, kneeY = L3, shX = 0.05, shY = hipY + L1;
    let off = { x: 0, y: 0 };
    if (squatty) {
      hipY = Math.max(0.35, L2 + L3 + disp);
      hipX = -0.12 * (1 - hipY / (L2 + L3));
      const d = Math.hypot(hipX, hipY);
      const a = (L3 * L3 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L3 * L3 - a * a));
      const px = (hipX * a) / d, py = (hipY * a) / d;
      kneeX = px + (h * hipY) / d; kneeY = py - (h * hipX) / d;      // the knee forward of the line
      shX = hipX + 0.08; shY = hipY + Math.sqrt(L1 * L1 - 0.08 * 0.08);
    } else if (rigid) off = { x: 0, y: disp };
    const toImg = (mx: number, my: number) => ({ x: ax + (mx + off.x) * k, y: ay - (my + off.y) * k });
    const pts: Lm[] = Array.from({ length: LANDMARK_COUNT }, () => lm(0.5 * aspect, 0.5, 0.2));
    const put = (i: number, mx: number, my: number, v = 0.95) => { const p = toImg(mx, my); pts[i] = lm((p.x + R.n() * poseSd) / aspect, p.y + R.n() * poseSd, v); };
    put(LEFT_ANKLE, 0, 0); put(RIGHT_ANKLE, 0.02, 0, 0.7);
    put(LEFT_KNEE, kneeX, kneeY); put(RIGHT_KNEE, kneeX + 0.02, kneeY, 0.7);
    put(LEFT_HIP, hipX, hipY); put(RIGHT_HIP, hipX + 0.02, hipY, 0.7);
    put(LEFT_SHOULDER, shX, shY); put(RIGHT_SHOULDER, shX + 0.02, shY, 0.7);
    put(NOSE, shX + 0.08, shY + 0.25);
    // the hands: on the bar (its height above the ankle), else at the shoulders' front
    const barY = lift.point === 'bar' || lift.point === 'wrist' ? (squatty ? shY : 1.0 + top + disp) : shY - 0.5;
    put(LEFT_WRIST, shX + 0.1, barY); put(RIGHT_WRIST, shX + 0.12, barY, 0.75);
    const f: VbtFrame = { t, image: pts };
    if (o.plate) {
      const p = toImg(shX + 0.1, barY);
      // the plate is nearer: its offsets from the image centre scale by the depth ratio
      const cx = 0.5 * aspect + (p.x - 0.5 * aspect) * depth, cy = 0.5 + (p.y - 0.5) * depth;
      f.plate = R.u() < 0.95 ? { cx: cx + R.n() * plateSd, cy: cy + R.n() * plateSd, r: (PLATE_DIAMETER_M / 2) * k * depth * (1 + R.n() * 0.004) } : null;
    }
    frames.push(f);
  }
  frames.sort((a, b) => a.t - b.t);
  return { frames, truth: reps, aspect, heightM: H };
}
