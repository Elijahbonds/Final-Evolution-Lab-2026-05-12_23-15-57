// hingeSetupBuild — synthetic landmark fixtures for the side-view hip-hinge audit and the lift set-up check
// (MIRROR-COACH P4, 2026-09-29). Test-only: hingeAudit.test.ts and setupLine.test.ts are the only importers.
//
// WHY A SEPARATE FILE, NOT lib/mirror/fixtures/build.ts's own FIXTURES ARRAY. build.ts's catalogue is a single
// shared array that fixtures.test.ts pins to an exact length and to a full recorded lib/mirror/fixtures/baseline.json
// entry per name — and phase 4 has four lanes (lunge, hinge, push-up + carry, personal baselines) adding fixtures to
// the SAME array in the SAME worktree at once. Landing a new name in that array here, mid-swarm, would race the other
// three lanes on one file and (per fixtures.test.ts §3) require a baseline re-record none of the four can safely do
// alone. So this file builds fixtures the SAME way — same synth.ts pipeline, same pinned FIXTURE_CAMERA, same IK
// (solveMiddle) and rotation helpers build.ts uses — without touching build.ts's registry. Folding these into that
// catalogue (a persisted .json per fixture, plus the baseline) is left for whoever integrates all four lanes' fixtures
// in one pass, so the required single re-record happens once, reviewed once.
//
// Every pose here is built in 3-D and filmed through lib/pose/synth.ts's virtual webcam, never hand-placed in image
// space — build.ts's own header explains why: a hand-placed frame is how the squat's knee-valgus sign shipped
// backwards (P1). synthesize() refuses a mirrored source, so the handedness convention (lib/pose/landmarks.ts:9-10:
// NOT mirrored, a body facing the camera has its LEFT shoulder on the image's RIGHT) cannot be gotten wrong here
// either.
import { synthesize, restPose, type Joints, type SynthOptions } from '@/lib/pose/synth';
import { MIRROR_INDEX, type PoseFrame, type Lm } from '@/lib/pose/landmarks';
import { solveMiddle, THIGH, SHIN, UPPER_ARM, FOREARM, hingePose, FIXTURE_CAMERA, CLEAN_FILM } from './build';

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Smooth 0→1, matching build.ts's ease — a rep accelerates and settles rather than moving at a constant rate. */
const ease = (u: number) => { const x = clamp01(u); return x * x * (3 - 2 * x); };

/** Rotate p about `pivot` around the X axis: + turns +Y toward +Z (a forward lean for a body facing +Z). Copied from
 *  build.ts's own private helper (pure math, no shared state — see the file header for why this is not imported). */
function rotX(p: V3, pivot: V3, a: number): V3 {
  const y = p[1] - pivot[1], z = p[2] - pivot[2], c = Math.cos(a), s = Math.sin(a);
  return [p[0], pivot[1] + y * c - z * s, pivot[2] + y * s + z * c];
}
/** Rotate p about `pivot` around the Y axis: + turns +Z toward +X. */
function rotY(p: V3, pivot: V3, a: number): V3 {
  const x = p[0] - pivot[0], z = p[2] - pivot[2], c = Math.cos(a), s = Math.sin(a);
  return [pivot[0] + x * c + z * s, p[1], pivot[2] - x * s + z * c];
}
function mapJ(j: Joints, f: (p: V3) => V3): Joints {
  return Object.fromEntries(Object.entries(j).map(([k, p]) => [k, f(p as V3)])) as Joints;
}
/** Turn a body built facing the camera so its LEFT side faces it (build.ts's toSide — the screen's side stations). */
function toSide(j: Joints): Joints { return mapJ(j, (p) => rotY(p, [0, 0, 0], -Math.PI / 2)); }

const UPPER: (keyof Joints)[] = ['Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];

export interface HingeLikeOpts {
  /** Hips-back travel at full depth (m). Default 0.17 — build.ts hingePose's own HINGE_BACK. */
  backM?: number;
  /** Hips-drop travel at full depth (m). Default 0.05 — a true hinge barely drops the hips; a squat drops them a lot. */
  dropM?: number;
  /** Trunk lean at full depth (deg from vertical). Default 70 — build.ts hingePose's own HINGE_TRUNK. */
  trunkDeg?: number;
  /** Extra forward-only travel of the HEAD joint at full depth (m), independent of the trunk rotation: a chin/head
   *  poke that breaks the ear–shoulder–hip line without touching the hip or knee geometry at all. */
  headPokeM?: number;
  /** Filmed side-on (default, LEFT shoulder to the camera) or facing the camera (a wrong-view take of the same rep). */
  view?: 'side' | 'front';
}

/**
 * A parameterised hip-hinge-shaped rep, same construction as build.ts hingePose (arms hang straight down from
 * gravity, legs solved by IK from hip to ankle) but with hip-back / hip-drop / trunk-lean split apart so a fixture can
 * dial in a knee-dominant ("squat-shaped") rep by dropping the hips a lot on a short back-travel — MIRROR-COACH P4.
 * At the defaults this is build.ts's own hingePose; that clean case reuses hingePose directly instead (see below).
 */
export function hingeLikePose(d: number, o: HingeLikeOpts = {}): Joints {
  const j = restPose();
  const back = (o.backM ?? 0.17) * d, drop = (o.dropM ?? 0.05) * d, trunk = (o.trunkDeg ?? 70) * d;
  const lh: V3 = [0.09, 0.95 - 0.005 - drop, -back], rh: V3 = [-0.09, lh[1], lh[2]];
  const la = j.LeftFoot, ra = j.RightFoot;
  j.Hips = [0, lh[1] + 0.03, lh[2]];
  for (const k of UPPER) j[k] = rotX(add(j[k], [0, lh[1] - 0.95, lh[2]]), j.Hips, rad(trunk));
  if (o.headPokeM) {
    // the poke is a plain +Z shift, AFTER the trunk rotation and independent of it: the dowel-line check reads
    // ear/shoulder/hip collinearity, and this is the one motion that breaks it without moving a hip or a knee.
    j.Head = add(j.Head, [0, 0, o.headPokeM]);
  }
  for (const s of ['Left', 'Right'] as const) {
    const sh = j[`${s}Arm`];
    j[`${s}ForeArm`] = add(sh, [0, -UPPER_ARM, 0.01]);
    j[`${s}Hand`] = add(sh, [0, -UPPER_ARM - FOREARM, 0.02]);
  }
  j.LeftUpLeg = lh; j.RightUpLeg = rh;
  j.LeftLeg = solveMiddle(lh, la, THIGH, SHIN, [0, 0, 1]);
  j.RightLeg = solveMiddle(rh, ra, THIGH, SHIN, [0, 0, 1]);
  return o.view === 'front' ? j : toSide(j);
}

/** Stand (hold0 frames) → down (down) → hold the bottom (bottom) → up (up) → stand (hold1): depth per frame, 0..1. */
function repCurve(hold0: number, down: number, bottom: number, up: number, hold1: number): number[] {
  const d: number[] = [];
  for (let i = 0; i < hold0; i++) d.push(0);
  for (let i = 0; i < down; i++) d.push(ease((i + 1) / down));
  for (let i = 0; i < bottom; i++) d.push(1);
  for (let i = 0; i < up; i++) d.push(ease(1 - (i + 1) / up));
  for (let i = 0; i < hold1; i++) d.push(0);
  return d;
}
/** One hinge-shaped rep, the same timing as build.ts's `hinge_side` fixture: 1s still, 1.2s down, 0.5s hold, 1.2s up, 0.5s still. */
const HINGE_REP = () => repCurve(30, 36, 15, 36, 15);

function film(frames: Joints[], opt: SynthOptions = CLEAN_FILM) {
  return synthesize({ fps: 30, frames }, { ...opt, camera: { ...FIXTURE_CAMERA, ...opt.camera } }).frames;
}

/** A clean hip hinge, side-on — build.ts's own hingePose (unmodified: the same fixture `hinge_side` is built from). */
export const hingeClean = (): PoseFrame[] => film(HINGE_REP().map((d) => hingePose(d)));
/** The same rep, filmed facing the camera instead of side-on — the wrong-view take. */
export const hingeWrongView = (): PoseFrame[] => film(HINGE_REP().map((d) => hingeLikePose(d, { view: 'front' })));
/** Knee-dominant: hips barely travel back (0.05 m) but drop a lot (0.30 m, which the leg IK reads as deep knee bend)
 *  on a modest trunk lean (30°) — "a squat when a hinge was asked for". Also drifts the shin forward (checks (a) and (c)). */
export const hingeSquatty = (): PoseFrame[] => film(HINGE_REP().map((d) => hingeLikePose(d, { backM: 0.05, dropM: 0.30, trunkDeg: 30 })));
/** Textbook hip:knee ratio (build.ts's own numbers) with a 10 cm head poke bolted on — good mechanics, broken dowel line. */
export const hingeHeadPoke = (): PoseFrame[] => film(HINGE_REP().map((d) => hingeLikePose(d, { headPokeM: 0.10 })));

/** A held lift set-up: hips part-way back (build.ts's own hinge numbers at d), hands hanging straight under the
 *  shoulders (i.e. under the bar), head neutral — good. `seconds` of 30 fps frames. */
function stillFrom(pose: Joints, seconds: number) { return film(Array.from({ length: Math.round(seconds * 30) }, () => pose)); }
export const setupClean = (seconds = 5): PoseFrame[] => stillFrom(hingePose(0.55), seconds);
export const setupWrongView = (seconds = 5): PoseFrame[] => stillFrom(hingeLikePose(0.55, { view: 'front' }), seconds);
/**
 * HIPS TOO HIGH: the trunk folds all the way over (70°, as if bent deep) but the hips barely drop (1.5 cm) and travel
 * back only a little (10 cm) — a stiff-legged look where the back does the folding and the hips ride high, rather
 * than the hips travelling back to meet the bar. The one fault setupLine's "hips between knees and shoulders" check
 * is built to name.
 */
export const setupHipsHigh = (seconds = 5): PoseFrame[] => stillFrom(hingeLikePose(1, { backM: 0.10, dropM: 0.015, trunkDeg: 70 }), seconds);

/** A mirrored (selfie) camera: x flips about the image centre and left/right landmark labels swap — the same
 *  transform fixtures.test.ts's own mirror invariant test applies to a squat fixture (lib/pose/landmarks.ts MIRROR_INDEX). */
export function mirrorFrames(frames: readonly PoseFrame[]): PoseFrame[] {
  return frames.map((f) => ({
    ...f,
    image: f.present ? MIRROR_INDEX.map((srcIdx): Lm => {
      const src = f.image[srcIdx];
      return src ? { ...src, x: 1 - src.x } : { x: 0.5, y: 0.5, z: 0, v: 0 };
    }) : f.image,
  }));
}

/** Force specific landmarks below any reasonable visibility gate — a deliberately unreadable take, not the synth's
 *  own (more generous) occlusion model. */
export function dimVisibility(frames: readonly PoseFrame[], indices: readonly number[], v = 0.15): PoseFrame[] {
  return frames.map((f) => ({
    ...f,
    image: f.present ? f.image.map((l, i) => (indices.includes(i) ? { ...l, v } : l)) : f.image,
  }));
}
