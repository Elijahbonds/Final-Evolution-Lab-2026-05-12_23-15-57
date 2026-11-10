// hipSteer — THE LEGS STEP THE WAY THE BODY GOES (hoops-p05, owner 2026-11-10: "the hero's slide — fix it").
//
// A defender keeps his chest on his man and travels wherever the play takes him; the tree has four families of stepping loop for that
// (the slides and the crossover run step sideways, the backpedal back, the run and the closeout forward) and picks the nearest. Whatever
// is left between the loop's own travel and the body's — a retreat on a diagonal, a slide that is half a backpedal, a capture that does
// not step dead along its axis — is a foot that sweeps one way while the floor goes another: at 4 m/s and 45° off, 5 cm a frame of slide
// that no playback rate can take out (measured: scripts/probes/hoops-gap/slide-bench.mts — the diagonals read 5–15 cm a frame p90 while
// the same loops along their own axis read under 1).
//
// So the PELVIS turns toward the travel and the spine turns back: the hips yaw by the angle between the loop's travel and the body's
// (eased, capped, by speed), about the vertical, and the three spine bones take a third of it back each, so the chest, the arms and the
// head stay exactly where the clip and the layers had them — on the man. The legs hang from the pelvis: their whole stride turns with
// it. It is what a defender does ("open the hips"); in an engine it is orientation warping.
//
// Runs FIRST on the after-animations pass (insert-first, like moveLegs: right after the clips evaluate), so the foot planter, the dip,
// the posture layer and footGlide all read the turned legs as the clip's. Visual only: nothing here reads or writes a speed, the root or
// the ball. Driven by the body's tree (BasketballAnimTree.attachSteer) with the loop its legs are in — under a defensive beat, the legs
// layer's loop. A body whose tree is not fed a travel direction (AnimTreeInput.travelOffRad) is never steered.
//
// The pure parts are exported for the tests; every number is a feel-panel knob (group "Hoops · transitions"), new and flagged.
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import type { Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';
import { feel } from '../../feel-panel/feel';

/** 1 = on; 0 = no pelvis turn at all (the layer writes nothing: today's legs exactly). Knob `hoops.hipSteerOn`. */
export const HIP_STEER_ON = 1;
/** The most the pelvis turns off the chest (deg). Knob `hoops.hipSteerMaxDeg`. */
export const HIP_STEER_MAX_DEG = 50;
/** The turn follows its target with this time constant (s). Knob `hoops.hipSteerSec`. */
export const HIP_STEER_SEC = 0.14;
/** No turn under this ground speed (m/s), all of it from HIP_STEER_FULL_MPS (a body shifting its weight is not travelling). Knobs
 *  `hoops.hipSteerFromMps`, `hoops.hipSteerFullMps`. */
export const HIP_STEER_FROM_MPS = 0.8;
export const HIP_STEER_FULL_MPS = 1.8;

/**
 * The travel each stepping loop's feet are made for, in the BODY frame: degrees from the chest, + = body-right (the tree's own
 * `travelOffRad` convention). The slides, the crossover run, the run and the closeout step along their axis (slide-bench `--clips`: the
 * crossover run ∓87°, the run 3°, the left slide −90°). The captured backpedal (CMU 78_24, played in reverse: basketballTree
 * BACKPEDAL_REVERSE_ON) steps back and 33° to the body's right. A state that is not here is not steered.
 */
export const LOOP_TRAVEL_DEG: Readonly<Record<string, number>> = {
  defend_slide: -90, defend_slide_right: 90, defend_slide_hard: -90, defend_slide_hard_right: 90,
  defend_run: -90, defend_run_right: 90, defend_backpedal: 180, run: 0, closeout: 0,
};
/** …and the captured backpedal's own travel once it is played in reverse (see above). */
export const BACKPEDAL_REVERSED_TRAVEL_DEG = 147;

/**
 * hoops-p05b: WHERE THE STEER RUNS. On the rig (seed 7, the switch alone off against all three slide switches on) the steer was the only one
 * acting in a real defensive possession, and it was not better everywhere: 3v3 the hero's slide p90 12.27 -> 12.65 cm (a bump landing on
 * turned hips), 1v1 its two severe foot pops 4 735 / 3 262 -> 5 120 / 3 789 deg/s (pops 5 -> 3). Where it measured better is the retreat:
 * the reversed backpedal capture steps 33 deg off straight back, and the steer lines its legs up with the retreat. So by default it runs on
 * the backpedal only; knob `hoops.hipSteerAllLoopsOn` 1 = every stepping loop (the slides, the crossover run, the run, the closeout), as
 * shipped in P5a. `hoops.hipSteerOn` 0 still turns it off everywhere.
 */
export const HIP_STEER_ALL_LOOPS_ON = 0;
export const HIP_STEER_DEFAULT_STATES: ReadonlySet<string> = new Set(['defend_backpedal']);

/** Where a body is travelling against where it faces (rad, 0 = straight ahead, + = body-right), or undefined under 0.6 m/s — OneVOneMode's
 *  `travelOff`, for a mode that has none of its own (the tree's `travelOffRad`). */
export function travelOffOf(yaw: number, vel: { x: number; z: number }): number | undefined {
  if (vel.x * vel.x + vel.z * vel.z < 0.36) return undefined;
  const d = Math.atan2(vel.x, vel.z) - yaw;
  return ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}
const wrapDeg = (d: number): number => ((d + 180) % 360 + 360) % 360 - 180;
/** How much of the turn at this ground speed (pure): 0 under `from`, 1 from `full`, smoothstep between. */
export function steerWeight(speedMps: number, from = HIP_STEER_FROM_MPS, full = HIP_STEER_FULL_MPS): number {
  if (!(speedMps > from)) return 0;
  const t = Math.min(1, (speedMps - from) / Math.max(1e-3, full - from));
  return t * t * (3 - 2 * t);
}
/**
 * The pelvis turn wanted (deg, + = toward body-right; pure): the body's travel less the loop's, the short way round, capped at
 * ±`maxDeg`, scaled by speed. `loopDeg` null (the state is not a stepping loop) or `travelOffRad` undefined (the body is not
 * travelling, or its mode does not say where) is 0.
 */
export function steerWantedDeg(loopDeg: number | null | undefined, travelOffRad: number | undefined, speedMps: number, maxDeg = HIP_STEER_MAX_DEG, from = HIP_STEER_FROM_MPS, full = HIP_STEER_FULL_MPS): number {
  if (loopDeg === null || loopDeg === undefined || travelOffRad === undefined || !Number.isFinite(travelOffRad)) return 0;
  const d = wrapDeg(travelOffRad * 180 / Math.PI - loopDeg);
  return Math.max(-maxDeg, Math.min(maxDeg, d)) * steerWeight(speedMps, from, full);
}
/** The turn's step toward its target (pure, frame-rate independent; tau 0 = at once). */
export function stepSteer(deg: number, target: number, dt: number, tauSec = HIP_STEER_SEC): number {
  if (!(dt > 0)) return deg;
  if (!(tauSec > 0)) return target;
  return target + (deg - target) * Math.exp(-dt / tauSec);
}

export interface SteerDrive { /** The loop state the legs are in (null: none — a one-shot, off the floor). */ state: string | null;
  /** A beat with its own legs is playing (a contact reaction, a stagger): the turn HOLDS where it is — unwound under the beat, the pelvis
   *  dragged the clip's planted foot round with it (the rig, 3v3 seed 7: 4 -> 8-11 cm a frame under bball_contact_react). It resumes from
   *  there when the beat ends. */
  hold?: boolean; /** The loop's travel when it is not the table's (the reversed backpedal). */ loopDeg?: number; travelOffRad: number | undefined; speedMps: number; dtSec: number }

const PER_SKELETON = new WeakMap<Skeleton, HipSteer>();
const UP = Vector3.Up();
/** One body's pelvis steer. Built once per body; writes nothing while its turn is under 0.05°. */
export class HipSteer {
  static for(scene: Scene, skeleton: Skeleton, root: TransformNode): HipSteer {
    const had = PER_SKELETON.get(skeleton); if (had) return had;
    const s = new HipSteer(scene, skeleton, root); PER_SKELETON.set(skeleton, s); return s;
  }
  private obs: Observer<Scene> | null = null;
  private readonly hips: TransformNode | null;
  private readonly spine: TransformNode[];
  private deg = 0;
  private target = 0;
  private readonly inv = new Matrix(); private readonly axis = new Vector3(); private readonly q = new Quaternion(); private readonly out = new Quaternion();

  constructor(private scene: Scene, skeleton: Skeleton, private root: TransformNode) {
    this.hips = findBone(skeleton, 'Hips')?.getTransformNode() ?? null;
    this.spine = ['Spine', 'Spine1', 'Spine2'].map((n) => findBone(skeleton, n)?.getTransformNode()).filter((n): n is TransformNode => !!n);
    // insert-first: right after the clips evaluate, before every other after-animations layer
    if (this.hips && this.spine.length) this.obs = scene.onAfterAnimationsObservable.add(() => this.apply(), undefined, true);
  }
  /** The pelvis turn drawn now (deg, + = toward body-right). */
  get turnDeg(): number { return this.deg; }

  /** Every frame from the tree. */
  drive(d: SteerDrive): void {
    const on = feel('hoops.hipSteerOn', HIP_STEER_ON) >= 0.5;
    if (on && d.hold) { this.target = this.deg; return; }
    const all = feel('hoops.hipSteerAllLoopsOn', HIP_STEER_ALL_LOOPS_ON) >= 0.5;
    const loopDeg = d.state === null || (!all && !HIP_STEER_DEFAULT_STATES.has(d.state)) ? null : d.loopDeg ?? LOOP_TRAVEL_DEG[d.state] ?? null;
    this.target = on ? steerWantedDeg(loopDeg, d.travelOffRad, d.speedMps, feel('hoops.hipSteerMaxDeg', HIP_STEER_MAX_DEG), feel('hoops.hipSteerFromMps', HIP_STEER_FROM_MPS), feel('hoops.hipSteerFullMps', HIP_STEER_FULL_MPS)) : 0;
    this.deg = on ? stepSteer(this.deg, this.target, d.dtSec, feel('hoops.hipSteerSec', HIP_STEER_SEC)) : 0;
    if (Math.abs(this.deg) < 0.05 && this.target === 0) this.deg = 0;
  }
  /** A reset, a new possession: no turn carried over. */
  reset(): void { this.deg = 0; this.target = 0; }
  dispose(): void { if (this.obs) { this.scene.onAfterAnimationsObservable.remove(this.obs); this.obs = null; } }

  /** Turn `n` by `deg` about the WORLD vertical, written as a local rotation: the vertical in its parent's frame (the parent's world
   *  matrix carries the importer's reflection — a rotation's sense flips under it, so the angle takes the determinant's sign). */
  private yaw(n: TransformNode, deg: number): void {
    const cur = n.rotationQuaternion; if (!cur) return;
    const p = n.parent as TransformNode | null;
    let sign = 1;
    if (p) {
      const m = p.computeWorldMatrix(true);
      m.invertToRef(this.inv); Vector3.TransformNormalToRef(UP, this.inv, this.axis);
      if (this.axis.lengthSquared() < 1e-12) return;
      this.axis.normalize(); if (m.determinant() < 0) sign = -1;
    } else this.axis.copyFrom(UP);
    Quaternion.RotationAxisToRef(this.axis, sign * deg * Math.PI / 180, this.q);
    this.q.multiplyToRef(cur, this.out); cur.copyFrom(this.out);
    n.computeWorldMatrix(true);
  }
  private apply(): void {
    if (this.deg === 0 || !this.hips) return;
    if (this.hips.isDisposed() || this.root.isDisposed()) { this.dispose(); return; }   // the body is gone
    this.yaw(this.hips, this.deg);
    const back = -this.deg / this.spine.length;
    for (const s of this.spine) this.yaw(s, back);   // parent first: each takes its share back, the chest ends where it was
  }
}
