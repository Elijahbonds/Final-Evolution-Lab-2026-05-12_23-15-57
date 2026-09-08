// DunkPosture — Posture Poses (PP), DUNK-POSTURE 2026-09-08 (post eye-REJECT on DUNK-BIOMECH @ 9cbd8e5).
//
// Rim-facing degrees PASSED and the athlete still looked wrong: a slumped gather, a flat hang, a dead land. The reason
// is structural — every dunk clip keys the HIPS and ONE spine bone (plus the legs, and the hands through the solver), so
// the thoracic chain (Spine1, Spine2), the clavicles and the head are never authored: they sit at whatever the run loop
// last left them for the whole flight (a mid-stride twist, held). A dunker's shape is exactly those bones — the chest
// opening to the rim on the hang, the shoulders up through the extension, the crunch into the iron, the eyes on the rim.
//
// This module is the pure half: a STANCE TABLE per window (approach / load / plant / rise / hang / extend / jam / brace /
// land / celebrate), per-trick overrides while a trick's body plays, the window resolver on the flight's own clock, and
// the chest-aim math. The mode (DunkMode.applyPostureLayer) writes it onto the rig AFTER the clips and the spin layer
// evaluate and BEFORE the wrist reach, in the clips' own degree convention (bindFrame). Layers, separate concerns:
//   RF  root facing   — faceVel / faceToward / the contact latch (unchanged)
//   SL  spin layer    — DunkSpin: the 360's whole-body turn on the hips (unchanged)
//   PP  posture poses — THIS: Spine1 / Spine2 / clavicles / head per window, the rim-locked chest aim, the hip-yaw strip
//   LT  limb tricks   — the authored trick bodies (arms, ball path, legs) ride on top, untouched
// Degrees are the clip convention: X = pitch (+ bends forward, − opens / extends), Y = yaw, Z = roll. `shrug` lifts both
// clavicles (+ up), `forward` protracts them (+ rounds the shoulders forward, − pulls them back / opens the chest).
import { EASTBAY_TIMING as T } from '../anim/authored/timing';
import { CUE_BEAT_T } from './DunkSystem';

export type Deg3 = [number, number, number];
export type PostureWindow = 'stance' | 'load' | 'plant' | 'rise' | 'hang' | 'extend' | 'jam' | 'brace' | 'land' | 'celebrate';
export interface PosturePose {
  /** Lumbar lean ADDED to the clip's own Spine key (degrees, + = forward): the runway loops stand upright; a dunker's
   *  approach leans into the plant. 0 in the air (the clips own the flight's lean). */
  lean: number;
  /** Thoracic (lower / upper), absolute from bind. */
  spine1: Deg3; spine2: Deg3;
  /** Neck and head from bind. The neck is keyed by SOME clips (the idle, the scorpion, the blown brace) and held by the
   *  rest — a chin-down brace used to survive into the land crouch and the next idle; the stance owns it now. */
  neck: Deg3; head: Deg3;
  /** Clavicles: + = shoulders up; + = shoulders forward (rounded), − = back (chest open). */
  shrug: number; forward: number;
  /** Eyes on the rim: the head's own yaw + pitch toward the iron, 0..1. */
  eyes: number;
  /** Rim-locked chest aim: the thoracic yaw that squares the chest to the rim (the spin subtracted), 0..1. */
  chestAim: number;
  /** How much of the CLIP's own hip yaw survives (the mocap gather swings the hips ±35°): 1 = all, 0 = stripped. */
  hipYawKeep: number;
  /** How far toward the stance the bones go (the runway loops keep some of their own life under 0.6). */
  weight: number;
}

// ── The stance table ───────────────────────────────────────────────────────
// Static reads (Dunkademics / Dunkman / @elijahbonds film): athletic gather = soft knees, chest tall, eyes on the rim;
// plant = shoulders toward the rim, loaded; hang = thoracic OPEN, tall, ball in the move; contact = chest and the jam
// arms INTO the iron; land = absorb / brace / celebrate, never a T.
export const POSTURE: Record<PostureWindow, PosturePose> = {
  stance:    { lean: 5, spine1: [4, 0, 0],   spine2: [-5, 0, 0],  neck: [-4, 0, 0], head: [-12, 0, 0], shrug: 0,  forward: 2,  eyes: 0.9,  chestAim: 0,    hipYawKeep: 1,   weight: 0.75 },   // the run loop rounds the chest and drops the eyes: the lumbar leans in, the thoracic stays tall, the eyes on the rim
  load:      { lean: 9, spine1: [8, 0, 0],   spine2: [-8, 0, 0],  neck: [-6, 0, 0], head: [-14, 0, 0], shrug: 3,  forward: 0,  eyes: 1,    chestAim: 0,    hipYawKeep: 1,   weight: 0.9 },
  plant:     { lean: 0, spine1: [-3, 0, 0],  spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-6, 0, 0],  shrug: 4,  forward: -4, eyes: 0.9,  chestAim: 0.35, hipYawKeep: 0.7, weight: 1 },
  rise:      { lean: 0, spine1: [-6, 0, 0],  spine2: [-10, 0, 0], neck: [-4, 0, 0], head: [-6, 0, 0],  shrug: 8,  forward: -3, eyes: 0.9,  chestAim: 0.6,  hipYawKeep: 0.5, weight: 1 },
  hang:      { lean: 0, spine1: [-8, 0, 0],  spine2: [-14, 0, 0], neck: [-4, 0, 0], head: [-6, 0, 0],  shrug: 10, forward: -5, eyes: 1,    chestAim: 0.85, hipYawKeep: 0.4, weight: 1 },
  extend:    { lean: 0, spine1: [-6, 0, 0],  spine2: [-10, 0, 0], neck: [-2, 0, 0], head: [-2, 0, 0],  shrug: 12, forward: 2,  eyes: 1,    chestAim: 1,    hipYawKeep: 0.3, weight: 1 },
  jam:       { lean: 0, spine1: [6, 0, 0],   spine2: [8, 0, 0],   neck: [2, 0, 0], head: [2, 0, 0],   shrug: 6,  forward: 8,  eyes: 1,    chestAim: 1,    hipYawKeep: 0.3, weight: 1 },
  brace:     { lean: 0, spine1: [10, 0, 0],  spine2: [12, 0, 0],  neck: [10, 0, 0], head: [8, 0, 0],   shrug: 4,  forward: 10, eyes: 0.2,  chestAim: 0.7,  hipYawKeep: 0.5, weight: 1 },
  land:      { lean: 0, spine1: [8, 0, 0],   spine2: [6, 0, 0],   neck: [-2, 0, 0], head: [-8, 0, 0],  shrug: 2,  forward: 6,  eyes: 0.5,  chestAim: 0.6,  hipYawKeep: 1,   weight: 0.9 },
  celebrate: { lean: -4, spine1: [-6, 0, 0],  spine2: [-10, 0, 0], neck: [-6, 0, 0], head: [-6, 0, 0],  shrug: 6,  forward: -8, eyes: 0.3,  chestAim: 0.5,  hipYawKeep: 1,   weight: 0.9 },
};

// ── Per-trick bodies (while the trick's clip plays, before the resolve) ────
// The trick's arms / ball path / legs are the clip's; these are the chest / shoulders / head it should carry.
export const TRICK_POSTURE: Record<string, Partial<PosturePose>> = {
  spin360:     { spine1: [-6, 0, 0], spine2: [-10, 0, 0], neck: [-6, 0, 0], head: [-4, 0, 0], shrug: 6,  forward: -2, chestAim: 0.85 },      // tall through the turn (the aim subtracts the spin)
  windmill:    { spine1: [-8, 0, 0], spine2: [-14, 0, 0], neck: [-4, 0, 0], head: [-6, 0, 0], shrug: 10, forward: -6 },                      // chest open under the swinging arm
  tomahawk:    { spine1: [-8, 0, 0], spine2: [-16, 0, 0], neck: [-6, 0, 0], head: [-8, 0, 0], shrug: 12, forward: -4 },                      // the cock-back is a thoracic extension
  scorpion:    { spine1: [8, 0, 0],  spine2: [6, 0, 0],   neck: [-16, 0, 0], head: [-14, 0, 0], shrug: 6, forward: 4,  chestAim: 0.5, eyes: 1 },   // chest DOWN, head UP at the rim
  eastbay:     { spine1: [4, 0, 0],  spine2: [0, 0, 0],   neck: [-8, 0, 0], head: [-10, 0, 0], shrug: 4, forward: 2,  eyes: 1 },              // watching the ball under the leg
  betweenlegs: { spine1: [4, 0, 0],  spine2: [0, 0, 0],   neck: [-8, 0, 0], head: [-10, 0, 0], shrug: 4, forward: 2,  eyes: 1 },
  lostfound:   { spine1: [-2, 0, 0], spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-4, 0, 0], shrug: 6,  forward: 0,  chestAim: 0.7 },        // the fake's hip turn reads; the chest stays on the iron
  hideseek:    { spine1: [-2, 0, 0], spine2: [-6, 0, 0],  neck: [-2, 0, 0], head: [-2, 0, 0], shrug: 8,  forward: 2,  chestAim: 0.7 },
};

// ── Limits and rates ───────────────────────────────────────────────────────
const D2R = Math.PI / 180;
/** The thoracic yaw the chest aim may add against the hips (a real hip–shoulder separation, never a broken spine). */
export const CHEST_AIM_CAP = 55 * D2R;
/** The head's own turn / tilt toward the rim on top of the chest. */
export const HEAD_YAW_CAP = 60 * D2R, HEAD_PITCH_CAP = 50 * D2R;
/** Low-pass time constants (s): the stance targets ease between windows, the aim corrections settle without jitter. */
export const POSTURE_TAU = 0.07, AIM_TAU = 0.05;
/** How the chest aim is split between the two thoracic bones (lower / upper), and the eyes between the neck and the head. */
export const AIM_SPLIT: [number, number] = [0.45, 0.55], EYES_SPLIT: [number, number] = [0.4, 0.6];

export const wrapRad = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** Frame-rate-independent low-pass gain for a step `dt` toward a target at time constant `tau`. */
export const lowPassK = (dt: number, tau: number): number => (dt <= 0 ? 0 : 1 - Math.exp(-dt / tau));

// ── The window resolver ────────────────────────────────────────────────────
export interface PostureInput {
  phase: 'approach' | 'charge' | 'cinematic' | 'resolve' | 'other';
  /** Flight clip seconds (the replay passes its replayed clock). */
  clipTime: number;
  /** resolve: the slam landed (jam) / missed (brace); null before the resolve. */
  made: boolean | null;
  /** The prop caught the flight: a brace whatever the slam was going to be. */
  clipped: boolean;
  /** Feet-down: the land clip owns the body until the idle loop returns. */
  landed: boolean;
  /** The land clip is the big-score celebrate. */
  celebrate: boolean;
  /** The air trick in flight (its own clock and its clip's length), if any. */
  trick: { id: string; t0: number; sec: number } | null;
}
export function postureWindow(i: PostureInput): PostureWindow {
  if (i.landed) return i.celebrate ? 'celebrate' : 'land';
  if (i.clipped) return 'brace';
  if (i.phase === 'resolve') return i.made ? 'jam' : 'brace';
  if (i.phase === 'cinematic') {
    if (i.clipTime < CUE_BEAT_T.rise) return 'plant';
    if (i.clipTime < CUE_BEAT_T.hang) return 'rise';
    if (i.clipTime < T.carryUp) return 'hang';
    return 'extend';
  }
  if (i.phase === 'charge') return 'load';
  return 'stance';
}
/** The stance for this frame: the window's, with the trick's chest / shoulders / head over it while its body plays in
 *  the air (never past the resolve — the jam / the brace own the finish). */
export function posturePose(i: PostureInput): { window: PostureWindow; pose: PosturePose; trick: string | null } {
  const window = postureWindow(i);
  const base = POSTURE[window];
  const inAir = window === 'rise' || window === 'hang' || window === 'extend' || window === 'plant';
  if (inAir && i.trick && i.clipTime >= i.trick.t0 && i.clipTime < i.trick.t0 + i.trick.sec) {
    const o = TRICK_POSTURE[i.trick.id];
    if (o) return { window, pose: { ...base, ...o }, trick: i.trick.id };
  }
  return { window, pose: base, trick: null };
}

// ── The rim-locked chest aim ───────────────────────────────────────────────
/** The thoracic yaw (frame space, the clips' own sense) that squares the chest to the rim: the chest should sit at the
 *  spin's yaw (it turns with the hips through a 360) plus the root's error to the rim mapped into the frame (`sign` is
 *  −1 under a mirrored import root, where a +yaw key turns the body −yaw in world). Capped: a hip–shoulder separation. */
export function chestAimCorrection(chestYawFrame: number, spinYaw: number, rootErrWorld: number, sign: 1 | -1, cap = CHEST_AIM_CAP): number {
  const want = spinYaw + sign * rootErrWorld;
  return clamp(wrapRad(want - chestYawFrame), -cap, cap);
}
/** The hip-yaw strip: how much frame-space yaw to ADD to the hips so `keep` of the clip's own hip yaw survives. */
export function hipYawStrip(clipHipYaw: number, keep: number): number { return -(1 - clamp(keep, 0, 1)) * wrapRad(clipHipYaw); }

/** Scalar fields of a pose, eased toward a target (the mode slerps the quaternion fields itself). */
export function easePose(cur: PosturePose, to: PosturePose, k: number): PosturePose {
  const l = (a: number, b: number) => a + (b - a) * k;
  const l3 = (a: Deg3, b: Deg3): Deg3 => [l(a[0], b[0]), l(a[1], b[1]), l(a[2], b[2])];
  return { lean: l(cur.lean, to.lean), spine1: l3(cur.spine1, to.spine1), spine2: l3(cur.spine2, to.spine2), neck: l3(cur.neck, to.neck), head: l3(cur.head, to.head), shrug: l(cur.shrug, to.shrug), forward: l(cur.forward, to.forward), eyes: l(cur.eyes, to.eyes), chestAim: l(cur.chestAim, to.chestAim), hipYawKeep: l(cur.hipYawKeep, to.hipYawKeep), weight: l(cur.weight, to.weight) };
}
export const clonePose = (p: PosturePose): PosturePose => easePose(p, p, 0);
