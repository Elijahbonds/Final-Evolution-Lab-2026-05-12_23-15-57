// lib/motion-lesson/adapter.ts — EDU-05 motion lessons, phase A (2026-11-03): a phone's pose → the rig's pose keys, at
// runtime, in the browser.
//
// docs/PLATFORM-ROADMAP.md §2.3 item 1. Today lib/babylon/anim/mocapRetarget.ts runs in build scripts over BVH files; a
// motion lesson needs it over the camera's own BlazePose WORLD landmarks (lib/pose/PoseService.ts). This file is that
// adapter and nothing more: it fills mocapRetarget's JointStream from PoseFrames, then calls retargetToPoseKeys
// UNCHANGED (mocapRetarget.ts and poseClip.ts are read-only here). The two-bone solver then fits the keys to whichever
// body plays — the "any avatar" half of the lesson.
//
//   · world landmarks are metres, origin between the hips, x image-right, y DOWN, z away from the camera. y is turned
//     up; the handedness this leaves is mocapRetarget's to settle (it finds FRONT anatomically, from the toes, so a
//     camera of either handedness cannot mirror a move — its own test pins that);
//   · frames arrive on the camera's clock with jitter and gaps: they are resampled to STREAM_FPS by linear interpolation,
//     a gap is bridged, and every stretch that was bridged or seen poorly is reported as WEAK (the lesson marks it, the
//     player can show it as a guide only there);
//   · the joints mocapRetarget reads (CANON) come from BlazePose's 33 points: the hips and shoulders' midpoints, the ears
//     for the head, the ankles and the foot-index points for the feet.
// Three things BlazePose needs before mocapRetarget reads it as it reads a BVH skeleton (2026-11-10, each measured on the
// owner's standing take, scripts/probes/motion-lesson/measure.mts):
//   · THE PELVIS. The rig's Hips bone sits above its hip joints (poseClip REF_HIPS_Y 0.96 over REF_HIP_JOINT_Y 0.91, on a
//     0.82 m leg); BlazePose's two hip points ARE the joints. Their midpoint is lifted along the spine by that share of
//     the leg, or every pose reads 5 cm sunk (with the next point, the standing take's hips: 10–13 cm under full height
//     → 4–7 cm. What is left is the take's own soft knees and the landmarks' ankle height; it is not chased further).
//   · LEG LENGTHS THAT DO NOT CHANGE. One camera's depth noise stretches a thigh or a shin frame by frame, and
//     mocapRetarget sizes the body by its 90th-percentile leg — so the noise reads as a longer leg and a smaller body
//     (measured: the scale 0.931 → 0.941 standing, 0.885 → 0.898 on the low jumps). Each leg bone is held to its median
//     length over the take (directions kept).
//   · THE FLIGHT. World landmarks are hips-centred: a jump is only the legs' bend, and mocapRetarget pins the lower
//     ankle to the floor. The PICTURE still has it: the height of the body's lowest point over the floor it rests on,
//     in metres by the body's own size in that picture (riseFromPicture). It rides in hipsY (the one translation a clip
//     carries). Only above FLOOR_NOISE_M, so a planted or heel-raised body does not float.
// What a phone still cannot give, honestly: travel across the room (a lesson plays on the spot), turns facing away, and
// fingers. The roadmap's limits list says so.
//
// Pure: numbers in, keys out. No camera, no model, no DOM — tested in node over the owner's own committed recordings.
import { retargetToPoseKeys, type Canon, type JointStream, type RetargetOpts, type RetargetReport, type V3 } from '@/lib/babylon/anim/mocapRetarget';
import {
  CORE_POINTS, LEFT_ANKLE, LEFT_EAR, LEFT_ELBOW, LEFT_FOOT_INDEX, LEFT_HIP, LEFT_KNEE, LEFT_SHOULDER, LEFT_WRIST,
  RIGHT_ANKLE, RIGHT_EAR, RIGHT_ELBOW, RIGHT_FOOT_INDEX, RIGHT_HIP, RIGHT_KNEE, RIGHT_SHOULDER, RIGHT_WRIST,
  LANDMARK_COUNT, type Lm, type PoseFrame, type Wm,
} from '@/lib/pose/landmarks';

/** (new) The stream's rate after resampling: the capture's own 30 fps. */
export const STREAM_FPS = 30;
/** (new) A frame whose core points' mean visibility is under this is WEAK. */
export const WEAK_VISIBILITY = 0.5;
/** (new) A gap longer than this (s) is bridged but marked WEAK. */
export const WEAK_GAP_S = 0.2;
/** (new) The longest a lesson recording may run (s): 10 minutes. */
export const MAX_RECORDING_S = 600;

/** (new) The rig's Hips bone over its hip joints, as a share of the leg: poseClip (REF_HIPS_Y − REF_HIP_JOINT_Y) / REF_LEG_LEN
 *  = (0.96 − 0.91) / 0.82. Copied, not imported (poseClip pulls Babylon into a pure module); the test holds the two equal. */
export const PELVIS_OVER_HIP_JOINTS = 0.05 / 0.82;
/** (new) Height off the floor under this (m) is the picture's noise or a heel raise, not a flight: read as planted. */
export const FLOOR_NOISE_M = 0.05;
/** (new) The most a flight may read (m): past it the floor line was lost, not cleared. */
export const MAX_RISE_M = 1.5;

const v3 = (w: Wm): V3 => [w.x, -w.y, w.z];
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const lerp = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const toward = (from: V3, to: V3, length: number): V3 => { const d = dist(from, to) || 1; return lerp(from, to, length / d); };
const median = (xs: number[]): number => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };

/** A take's own leg: each bone's median length (m), [left, right]. */
export interface LegFit { thigh: [number, number]; shin: [number, number] }

/** The take's leg bones, measured: the median of every frame's thigh and shin. */
export function legFitOf(worlds: readonly (readonly Wm[])[]): LegFit {
  const m = (a: number, b: number) => median(worlds.map((w) => dist(v3(w[a]), v3(w[b]))));
  return { thigh: [m(LEFT_HIP, LEFT_KNEE), m(RIGHT_HIP, RIGHT_KNEE)], shin: [m(LEFT_KNEE, LEFT_ANKLE), m(RIGHT_KNEE, RIGHT_ANKLE)] };
}

/**
 * One frame's CANON joints from its 33 world landmarks (y turned up). With the take's `fit`: each leg bone held to its
 * measured length, and the pelvis lifted over the hip joints (the header's first two points). Without it: the raw points.
 */
export function canonJoints(w: readonly Wm[], fit?: LegFit): Record<Canon, V3> {
  const p = (i: number) => v3(w[i]);
  const hipMid = mid(p(LEFT_HIP), p(RIGHT_HIP));
  const neck = mid(p(LEFT_SHOULDER), p(RIGHT_SHOULDER));
  const leg = (hip: number, knee: number, ankle: number, toe: number, side: 0 | 1) => {
    const h = p(hip);
    if (!fit) return { up: h, knee: p(knee), foot: p(ankle), toe: p(toe) };
    const k = toward(h, p(knee), fit.thigh[side]);
    const a = toward(k, [k[0] + p(ankle)[0] - p(knee)[0], k[1] + p(ankle)[1] - p(knee)[1], k[2] + p(ankle)[2] - p(knee)[2]], fit.shin[side]);
    const t = p(toe), a0 = p(ankle);
    return { up: h, knee: k, foot: a, toe: [a[0] + t[0] - a0[0], a[1] + t[1] - a0[1], a[2] + t[2] - a0[2]] as V3 };
  };
  const L = leg(LEFT_HIP, LEFT_KNEE, LEFT_ANKLE, LEFT_FOOT_INDEX, 0), R = leg(RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE, RIGHT_FOOT_INDEX, 1);
  const legLen = fit ? (fit.thigh[0] + fit.shin[0] + fit.thigh[1] + fit.shin[1]) / 2 : 0;
  const hips = fit ? toward(hipMid, neck, PELVIS_OVER_HIP_JOINTS * legLen) : hipMid;
  return {
    Hips: hips,
    // BlazePose has no spine points: the chest sits 70% of the way up the hip joints → shoulders line
    Chest: lerp(hipMid, neck, 0.7),
    Neck: neck,
    Head: mid(p(LEFT_EAR), p(RIGHT_EAR)),
    LeftArm: p(LEFT_SHOULDER), LeftForeArm: p(LEFT_ELBOW), LeftHand: p(LEFT_WRIST),
    RightArm: p(RIGHT_SHOULDER), RightForeArm: p(RIGHT_ELBOW), RightHand: p(RIGHT_WRIST),
    LeftUpLeg: L.up, LeftLeg: L.knee, LeftFoot: L.foot, LeftToe: L.toe,
    RightUpLeg: R.up, RightLeg: R.knee, RightFoot: R.foot, RightToe: R.toe,
  };
}

// ── the flight, from the picture ────────────────────────────────────────────────────────────────────────────────

const hasImage = (f: PoseFrame): boolean => f.image.length === LANDMARK_COUNT;
/** The lowest point of the body in the picture (image y runs DOWN: the largest y), among the points the camera sees. */
const lowestY = (image: readonly Lm[]): number => image.reduce((lo, l) => ((l.v ?? 1) >= WEAK_VISIBILITY && Number.isFinite(l.y) ? Math.max(lo, l.y) : lo), -Infinity);

/** (new) The picture's scale (metres per unit of image height) is the median over this long either side of a frame (s):
 *  one frame's world landmarks are too noisy to scale a height by, and nobody changes distance from a camera this fast. */
export const SCALE_WINDOW_S = 0.2;
/** (new) The floor is this share of the way up the take's sorted lowest-point heights: under the feet of a body that is
 *  on the floor for at least a fifth of the take (the owner's high-jump take is on it for 27%). */
export const FLOOR_PERCENTILE = 0.2;

/**
 * How far each frame's body is off the floor (m, the capture's own metres), read from the picture.
 *
 * A point's height against the camera's own height is (0.5 − its image y) × the metres one unit of image height spans at
 * the body, WHATEVER the distance (a level pinhole camera: both scale with distance, and it cancels). The metres per
 * unit come from the body itself: the shoulders' midpoint over the lower ankle, in the world landmarks against in the
 * picture. So the body's lowest point has a height every frame; the floor is where that rests (FLOOR_PERCENTILE), and
 * the flight is what is over it, less FLOOR_NOISE_M.
 *
 * Measured on the takes' ground truth (lib/pose/__fixtures__ gt.perFrame, 2026-11-10; eleven takes, 13 jumps;
 * scripts/probes/motion-lesson/measure.mts): with both feet down the worst read is 4 cm (the one-foot dunk; 0 standing
 * still), and a jump's top reads 10 cm low to 2 cm high (the max jump: 0.72 read, 0.72 true).
 * A first version with a floor LINE in the image (fixed, then a rolling window) read a step toward the camera as a
 * 16–20 cm float on the high-jump take: that is why the height is taken in metres, not in the image.
 * assumption: the phone is roughly level. A tilted camera turns a step toward it into a small height error.
 *
 * A frame with no picture: NaN (the caller bridges it). A take with no picture at all: all 0.
 */
export function riseFromPicture(frames: readonly (PoseFrame & { world: Wm[] })[]): number[] {
  const idx = frames.map((f, i) => (hasImage(f) && Number.isFinite(lowestY(f.image)) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 4) return frames.map(() => 0);
  const unit = idx.map((i) => {
    const f = frames[i];
    const ankle = f.image[LEFT_ANKLE].y >= f.image[RIGHT_ANKLE].y ? LEFT_ANKLE : RIGHT_ANKLE;
    const inPicture = f.image[ankle].y - (f.image[LEFT_SHOULDER].y + f.image[RIGHT_SHOULDER].y) / 2;
    const inWorld = f.world[ankle].y - (f.world[LEFT_SHOULDER].y + f.world[RIGHT_SHOULDER].y) / 2;   // world y runs down too
    return inPicture > 0.15 && inWorld > 0.3 ? inWorld / inPicture : NaN;
  });
  const allUnits = unit.filter(Number.isFinite);
  if (allUnits.length < 4) return frames.map(() => 0);
  const unitOfTake = median(allUnits);
  const height: number[] = [];
  let a = 0, b = 0;
  for (let k = 0; k < idx.length; k++) {
    const t = frames[idx[k]].t;
    while (frames[idx[a]].t < t - SCALE_WINDOW_S * 1000) a++;
    while (b + 1 < idx.length && frames[idx[b + 1]].t <= t + SCALE_WINDOW_S * 1000) b++;
    const units = unit.slice(a, b + 1).filter(Number.isFinite);
    height.push((0.5 - lowestY(frames[idx[k]].image)) * (units.length >= 3 ? median(units) : unitOfTake));
  }
  const sorted = [...height].sort((x, y) => x - y);
  const floor = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * FLOOR_PERCENTILE))];
  const out = frames.map(() => NaN);
  idx.forEach((i, k) => { out[i] = Math.max(0, Math.min(MAX_RISE_M, height[k] - floor - FLOOR_NOISE_M)); });
  return out;
}

const usable = (f: PoseFrame): f is PoseFrame & { world: Wm[] } =>
  f.present && Array.isArray(f.world) && f.world.length === LANDMARK_COUNT && f.world.every((w) => Number.isFinite(w.x) && Number.isFinite(w.y) && Number.isFinite(w.z));

const seen = (f: PoseFrame): number => {
  if (f.image.length !== LANDMARK_COUNT) return 1;   // a source with no visibility (a replay) is not marked
  return CORE_POINTS.reduce<number>((s, i) => s + (f.image[i]?.v ?? 0), 0) / CORE_POINTS.length;
};

export interface Recording {
  stream: JointStream;
  /** Seconds covered (the stream's frames ÷ STREAM_FPS). */
  seconds: number;
  /** [from, to] seconds where the movement was bridged over a gap or seen poorly. */
  weak: [number, number][];
  /** Metres off the floor per stream frame, read from the picture (riseFromPicture); the capture's own metres. */
  rise: number[];
}

/**
 * Camera frames → a uniform JointStream, with the weak stretches and the flight. null when there is too little body to use.
 * `raw`: BlazePose's points as they come — no leg fit, no pelvis lift, no flight (the control the tests and the rig's
 * before/after sheet read; not what a lesson is made with).
 */
export function framesToRecording(frames: readonly PoseFrame[], o: { raw?: boolean } = {}): Recording | null {
  const ok = frames.filter(usable).sort((a, b) => a.t - b.t);
  if (ok.length < 2) return null;
  const t0 = ok[0].t, tEnd = ok[ok.length - 1].t;
  const seconds = Math.min(MAX_RECORDING_S, (tEnd - t0) / 1000);
  const n = Math.floor(seconds * STREAM_FPS) + 1;
  if (n < 2) return null;
  const fit = o.raw ? undefined : legFitOf(ok.map((f) => f.world));
  const joints = ok.map((f) => canonJoints(f.world, fit));
  // the flight: a frame with no picture takes its neighbours' (the nearest seen frame on each side)
  const up = o.raw ? ok.map(() => 0) : riseFromPicture(ok);
  for (let i = 0; i < up.length; i++) {
    if (Number.isFinite(up[i])) continue;
    let a = i - 1, b = i + 1;
    while (a >= 0 && !Number.isFinite(up[a])) a--;
    while (b < up.length && !Number.isFinite(up[b])) b++;
    up[i] = a >= 0 && b < up.length ? (up[a] + up[b]) / 2 : a >= 0 ? up[a] : b < up.length ? up[b] : 0;
  }
  const out: Record<Canon, V3>[] = [];
  const rise: number[] = [];
  const weakAt: boolean[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = t0 + (k * 1000) / STREAM_FPS;
    while (j < ok.length - 2 && ok[j + 1].t < t) j++;
    const a = ok[j], b = ok[j + 1];
    const u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
    const ja = joints[j], jb = joints[j + 1];
    const frame = {} as Record<Canon, V3>;
    for (const name of Object.keys(ja) as Canon[]) frame[name] = lerp(ja[name], jb[name], u);
    out.push(frame);
    rise.push(up[j] + (up[j + 1] - up[j]) * u);
    weakAt.push((b.t - a.t) / 1000 > WEAK_GAP_S || Math.min(seen(a), seen(b)) < WEAK_VISIBILITY);
  }
  const weak: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    if (!weakAt[k]) continue;
    const from = k / STREAM_FPS;
    while (k + 1 < n && weakAt[k + 1]) k++;
    weak.push([Math.round(from * 100) / 100, Math.round((k / STREAM_FPS) * 100) / 100]);
  }
  // one [1 2 1] pass: a single frame's flicker in the floor line is not a hop
  const smooth = rise.map((r, k) => (rise[Math.max(0, k - 1)] + 2 * r + rise[Math.min(n - 1, k + 1)]) / 4);
  return { stream: { fps: STREAM_FPS, frames: out }, seconds: (n - 1) / STREAM_FPS, weak, rise: smooth };
}

export type KeysOpts = Partial<Pick<RetargetOpts, 'from' | 'to' | 'keyFps' | 'loop' | 'mirror' | 'smoothSec'>> & {
  /** Leave the flight out (the keys exactly as mocapRetarget gives them). Default: the flight rides in hipsY. */
  noRise?: boolean;
};

/** A recording's pose keys (the whole recording by default), through mocapRetarget unchanged; then the flight, in hipsY. */
export function recordingToKeys(rec: Recording, o: KeysOpts = {}): RetargetReport {
  const from = Math.max(0, o.from ?? 0);
  const to = Math.min(rec.seconds, o.to ?? rec.seconds);
  const report = retargetToPoseKeys(rec.stream, { from, to, keyFps: o.keyFps ?? 20, loop: o.loop, mirror: o.mirror, smoothSec: o.smoothSec });
  if (o.noRise || !rec.rise.some((r) => r > 0)) return report;
  const last = rec.rise.length - 1;
  const riseAt = (sec: number): number => {
    const x = Math.max(0, Math.min(last, sec * STREAM_FPS)), a = Math.floor(x), b = Math.min(last, a + 1);
    return rec.rise[a] + (rec.rise[b] - rec.rise[a]) * (x - a);
  };
  // the keys are in the reference body's metres: the capture's metres times the retarget's own scale
  const keys = report.keys.map((k) => {
    const up = riseAt(from + k.t) * report.scale;
    return up > 0 ? { ...k, hipsY: Math.round(((k.hipsY ?? 0) + up) * 100) / 100 } : k;
  });
  return { ...report, keys };
}
