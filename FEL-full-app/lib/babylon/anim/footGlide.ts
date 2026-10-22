// footGlide — A FOOT ON THE FLOOR DOES NOT SKATE (hoops-dip movement pass, owner 2026-10-20: "foot sliding: measure the feet skating during
// cuts, stops and turns across 1v1 and 3v3, and plant them").
//
// Measured on the rig at #375 (1v1, the stance-foot read: the lower ankle within 3 cm of the body's floor, its travel in the WORLD a frame):
// 93 cm of it through a stop, 107 through a start, 141–165 through a cut and a reversal, 134 through the momentum cross — worst frames
// 9–18 cm. Two kinds, neither of which the foot planter (FootPlanting) holds, by design: it pins a foot the clip keeps STILL relative to the
// body and lets go of one the clip swings (HOOPS-DEPTH S7: pinning a swinging foot popped it at the drift limit):
//   · the SKIM — at a run the loops' swing foot runs its last 20–30 cm along the floor (ankle 2–5 cm up, 9–18 cm a frame) before it lands;
//   · the GLIDE — with the body (nearly) still, at the end of a stop, the start of a start and a turn in place, the loops' crossfade moves
//     BOTH feet at floor height from one stance to the next, 1–4 cm a frame for a quarter second.
// And a clip whose straight leg reaches under the floor (the momentum cross: the ankle 7.5 cm through it).
//
// So, per foot, after every other layer has drawn it:
//   · the body moving (over STILL_BODY_MPS): a foot moving over the floor is drawn OFF it — its ankle at least its floor + a clearance that
//     grows with its world speed (glideLift; nothing under GLIDE_FROM_MPS, so a planted or settling foot is untouched). A skim becomes a
//     swing that clears the floor and lands where it stops.
//   · the body still: a foot that starts to glide is HELD where it stood; when the clip has carried it STEP_TRIGGER_M away (or stopped
//     SETTLE_M away, or lifted it) it STEPS there — a STEP_SEC arc, STEP_LIFT_M high — and never while the other foot is stepping. The
//     glide becomes alternating steps, one foot always on the floor.
//   · no ankle is drawn under its own floor height (each foot's, learnt from it standing still: the rig's two feet stand 2 cm apart).
// The leg is re-solved with the planter's two-bone IK (the knee in its own bend plane), the foot's turn kept. Speeds are read from where
// the layers before drew the foot, never from this layer's own output.
//
// Visual only: nothing here reads or writes a speed, the root, a timer or the ball. Mounted LAST on the after-animations pass (after the
// planter, the dip, the posture and motion layers), so it sees the foot as drawn.
import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { plantLeg } from './FootPlanting';
import { animDt } from './motionLayers';

/** A foot moving over the floor slower than this (m/s) is left where it is drawn: a planted foot, a settling one. (new) */
export const GLIDE_FROM_MPS = 0.5;
/** …and from this speed a moving body's skimming foot gets the full clearance. (new) */
export const GLIDE_FULL_MPS = 2.0;
/** The clearance (m, the ankle over its floor height). (new) */
export const GLIDE_LIFT_M = 0.05;
/** The body counts as still under this ground speed (m/s): its gliding feet are held and stepped, not lifted. (new) */
export const STILL_BODY_MPS = 0.5;
/** A held foot steps once the clip has carried it this far (m) … (new) */
export const STEP_TRIGGER_M = 0.08;
/** … or once the clip's foot has stopped (under SETTLE_MPS) this far from it (m). (new) */
export const SETTLE_M = 0.015;
export const SETTLE_MPS = 0.2;
/** A step's time (s) and its lift at the middle (m). (new) */
export const STEP_SEC = 0.15;
export const STEP_LIFT_M = 0.04;
/** A held foot the leg misses by more than this (m: out of its reach) steps at once. */
export const HELD_MISS_M = 0.01;
/** "On the floor": the foot within this of its floor height (m). */
export const GROUND_M = 0.03;
/** The floor is learnt from a foot standing still (under this speed, m/s) … */
export const FLOOR_STILL_MPS = 0.2;
/** … within this band of heights over the root (m: a planted ankle on these bodies sits 5–8 cm up) … */
export const FLOOR_BAND_M: readonly [number, number] = [0.0, 0.12];
/** … followed over this time constant (s); a still foot more than FLOOR_HOLE_M under it is a leg through the floor, not learnt. */
export const FLOOR_TAU_SEC = 0.5;
export const FLOOR_HOLE_M = 0.02;
/** A move longer than this in one frame (m) is a teleport (a reset, a placement), not a foot or a body moving. */
export const GLIDE_TELEPORT_M = 0.8;

const smooth = (a: number, b: number, x: number): number => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
/** The clearance (m) for a foot moving at `speedMps` over the floor (pure). */
export const glideLift = (speedMps: number): number => GLIDE_LIFT_M * smooth(GLIDE_FROM_MPS, GLIDE_FULL_MPS, speedMps);
/** A moving body's ankle height over the root (pure): never under the floor, at least the floor + the clearance while the foot moves. */
export const glideAnkleY = (ankleY: number, floorY: number, speedMps: number): number => Math.max(ankleY, floorY + glideLift(speedMps));
/** A step's lift at progress u (0..1, pure): 0 at both ends. */
export const stepArc = (u: number): number => (u <= 0 || u >= 1 ? 0 : STEP_LIFT_M * Math.sin(Math.PI * u));

export type FootMode = 'free' | 'held' | 'step';
export interface FootState { mode: FootMode; from: { x: number; y: number; z: number }; t: number; drawn: { x: number; y: number; z: number } | null }
export const footIdle = (): FootState => ({ mode: 'free', from: { x: 0, y: 0, z: 0 }, t: 0, drawn: null });
export interface FootIn {
  /** Where the layers before drew the ankle (world), and its height over the root. */
  c: { x: number; y: number; z: number }; h: number;
  /** Its world speed (m/s), this foot's floor height over the root (NaN: not learnt yet), the root's height. */
  v: number; floor: number; rootY: number;
  bodyStill: boolean; otherStepping: boolean; dt: number;
}
/** One foot, one frame (pure): where to draw its ankle (world), or null to leave it as the layers before drew it. Mutates `s`. */
export function stepFoot(s: FootState, i: FootIn): { x: number; y: number; z: number } | null {
  const known = Number.isFinite(i.floor);
  const floorW = known ? i.rootY + i.floor : -Infinity;
  const grounded = known && i.h < i.floor + GROUND_M;
  const startStep = () => { s.mode = 'step'; s.t = 0; s.from = { ...(s.drawn ?? i.c) }; };
  if (s.mode === 'held' && !i.bodyStill) startStep();   // the body set off: a held foot steps to where the clip has it
  if (s.mode === 'free' && i.bodyStill && grounded && i.v > GLIDE_FROM_MPS) { s.mode = 'held'; s.from = { ...(s.drawn ?? i.c) }; }
  if (s.mode === 'held') {
    const drift = Math.hypot(i.c.x - s.from.x, i.c.z - s.from.z);
    if (!i.otherStepping && (!grounded || drift > STEP_TRIGGER_M || (i.v < SETTLE_MPS && drift > SETTLE_M))) startStep();
    else if (i.v < SETTLE_MPS && drift <= SETTLE_M) s.mode = 'free';   // the clip came to rest under the pin: nothing to step
    else { const held = { x: s.from.x, y: Math.max(i.c.y, floorW), z: s.from.z }; s.drawn = { ...held }; return held; }   // held where it stood, at the clip's height (a heel it lifts), never under the floor
  }
  let out: { x: number; y: number; z: number };
  if (s.mode === 'step') {
    s.t += i.dt; const u = Math.min(1, s.t / STEP_SEC), e = u * u * (3 - 2 * u);
    const cy = Math.max(i.c.y, floorW);
    out = { x: s.from.x + (i.c.x - s.from.x) * e, y: s.from.y + (cy - s.from.y) * e + stepArc(u), z: s.from.z + (i.c.z - s.from.z) * e };
    if (u >= 1) s.mode = 'free';
  } else {
    const y = i.bodyStill || !known ? Math.max(i.c.y, floorW) : i.rootY + glideAnkleY(i.h, i.floor, i.v);
    out = { x: i.c.x, y, z: i.c.z };
  }
  s.drawn = { ...out };
  return out.y > i.c.y + 1e-4 || out.x !== i.c.x || out.z !== i.c.z ? out : null;
}

interface Leg { hip: TransformNode; knee: TransformNode; ankle: TransformNode; last: Vector3; seen: boolean; floor: number; s: FootState }
const lq = (n: TransformNode): Quaternion => n.rotationQuaternion ?? Quaternion.FromEulerVector(n.rotation);
const PER_SKELETON = new WeakMap<Skeleton, FootGlide>();

/** One body's glide guard. */
export class FootGlide {
  static for(scene: Scene, skeleton: Skeleton, root: TransformNode): FootGlide {
    const had = PER_SKELETON.get(skeleton); if (had) return had;
    const g = new FootGlide(scene, skeleton, root); PER_SKELETON.set(skeleton, g); return g;
  }
  private obs: Observer<Scene> | null;
  private readonly legs: Leg[] = [];
  private lastRoot = new Vector3(); private rootSeen = false;
  /** Each foot's mode and how far it was moved from where the layers before drew it on the last frame (m) — the probe's and the tests' read. */
  modes: FootMode[] = ['free', 'free'];
  moved: [number, number] = [0, 0];
  /** Each foot's floor height over the root (NaN until it has stood still). */
  get floors(): number[] { return this.legs.map((l) => l.floor); }

  constructor(private scene: Scene, skeleton: Skeleton, private root: TransformNode) {
    for (const sd of ['Left', 'Right'] as const) {
      const hip = findBone(skeleton, `${sd}UpLeg`)?.getTransformNode(), knee = findBone(skeleton, `${sd}Leg`)?.getTransformNode(), ankle = findBone(skeleton, `${sd}Foot`)?.getTransformNode();
      if (hip && knee && ankle) this.legs.push({ hip, knee, ankle, last: new Vector3(), seen: false, floor: NaN, s: footIdle() });
    }
    this.obs = this.legs.length === 2 ? scene.onAfterAnimationsObservable.add(() => this.apply()) : null;
  }
  dispose(): void { if (this.obs) { this.scene.onAfterAnimationsObservable.remove(this.obs); this.obs = null; } }

  private apply(): void {
    if (this.root.isDisposed()) { this.dispose(); return; }   // the body is gone
    const dt = animDt(this.scene.getEngine().getDeltaTime() / 1000, this.scene.animationTimeScale);
    if (!(dt > 0)) return;   // a frame with no time in it: the layers' pose stands
    this.root.computeWorldMatrix(true);
    const rp = this.root.getAbsolutePosition(), rootY = rp.y;
    const rootStep = this.rootSeen ? Math.hypot(rp.x - this.lastRoot.x, rp.z - this.lastRoot.z) : 0;
    this.lastRoot.copyFrom(rp); this.rootSeen = true;
    const placed = rootStep > GLIDE_TELEPORT_M;
    const bodyStill = placed || rootStep / dt < STILL_BODY_MPS;
    const yaw = this.root.absoluteRotationQuaternion ? this.root.absoluteRotationQuaternion.toEulerAngles().y : this.root.rotation.y;
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    // the clip's ankles first (both, before either is moved: a step waits on the other foot's mode)
    const ins = this.legs.map((l) => {
      for (const n of [l.hip, l.knee, l.ankle]) n.computeWorldMatrix(true);
      const p = l.ankle.getAbsolutePosition().clone();
      const step = l.seen ? Math.hypot(p.x - l.last.x, p.z - l.last.z) : 0;
      const jumped = placed || step > GLIDE_TELEPORT_M;
      if (jumped) l.s = footIdle();
      l.last.copyFrom(p); l.seen = true;
      const v = jumped ? 0 : step / dt, h = p.y - rootY;
      // (a still foot well under the floor already learnt is a clip's leg through it, not the floor: not learnt)
      if (v < FLOOR_STILL_MPS && h >= FLOOR_BAND_M[0] && h <= FLOOR_BAND_M[1] && !(h < l.floor - FLOOR_HOLE_M))
        l.floor = Number.isFinite(l.floor) ? l.floor + (h - l.floor) * (1 - Math.exp(-dt / FLOOR_TAU_SEC)) : h;
      return { p, v, h };
    });
    const stepping = this.legs.map((l) => l.s.mode === 'step');
    this.legs.forEach((l, i) => {
      const tgt = stepFoot(l.s, { c: ins[i].p, h: ins[i].h, v: ins[i].v, floor: l.floor, rootY, bodyStill, otherStepping: stepping[1 - i] || this.legs[1 - i].s.mode === 'step', dt });
      this.modes[i] = l.s.mode; this.moved[i] = 0;
      if (!tgt) return;
      const t = new Vector3(tgt.x, tgt.y, tgt.z); this.moved[i] = Vector3.Distance(t, ins[i].p);
      const chain = lq(l.hip).multiply(lq(l.knee)).multiply(lq(l.ankle));
      const bend = l.knee.getAbsolutePosition().subtract(l.hip.getAbsolutePosition().add(t).scale(0.5));
      const miss = plantLeg(l.hip, l.knee, l.ankle, t, bend.lengthSquared() > 1e-4 ? bend.normalize() : fwd);
      // a held foot the leg can no longer reach (the hips moved off it) steps from where the leg could put it
      if (l.s.mode === 'held' && miss > HELD_MISS_M) { l.ankle.computeWorldMatrix(true); const a = l.ankle.getAbsolutePosition(); l.s.mode = 'step'; l.s.t = 0; l.s.from = { x: a.x, y: a.y, z: a.z }; l.s.drawn = { ...l.s.from }; }
      // the foot keeps its turn (the hips did not move: its turn under the hips is its turn in the world)
      l.ankle.rotationQuaternion = Quaternion.Inverse(lq(l.hip).multiply(lq(l.knee))).multiply(chain);
      l.ankle.computeWorldMatrix(true);
    });
  }
}
