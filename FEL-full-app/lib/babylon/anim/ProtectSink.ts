// ProtectSink — THE PROTECT SITS LOWER (lane/h3-handler, owner 2026-10-24: the protect posture of PR #312, "H3b": "hips ≥ 5 cm lower than
// unpressured", HOOPS MOTION plan phase 9's gate). The rig operation is #380's (anim/legSink, hoops-dip): the hips down to a height over
// the root, each leg re-solved so its foot stays where every layer before put it, each arm re-solved so its hand stays too. #312 had
// written its own held sink into LandingAbsorb; #380 has since built the shared one, so this is that, held: the mode says "protecting"
// and the hips ease PROTECT_SINK_M down (over PROTECT_SINK_SEC), and back up when it stops.
//
// Why it matters now: with #312's protect clip (anim/RestDribble) the protect plays the idle dribble loop, whose hips sit ~21 cm under
// bind — the defender's stance it replaced sat ~37 cm under. Without the sink the protect would stand UP out of a crouch; with it the body
// sits PROTECT_SINK_M under its own dribble height, the ball's palm going down with it (RestDribble.GUARD_DROP_M).
//
// Mounted like LocoAccent (after the posture layer, before the carry: the carry's reach then reads the lowered shoulders). Visual only:
// it reads the root and writes the legs, the hips and (keeping them) the hands — no speed, timer, window or roll. Feature knob
// `hoops.protectPostureOn` (HoopsLook) with `hoops.protectSinkM` and `hoops.protectSinkSec` (group "Hoops · handle (rest)").
import type { Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { animDt } from './motionLayers';
import { sinkRig, sinkRead, sinkHipsKeepFeet, type SinkRig } from './legSink';
import { DIP_MIN_HIPS_OVER_ANKLE } from './moveDip';
import { feel } from '../../feel-panel/feel';
import { PROTECT_POSTURE_ON } from '../core/HoopsLook';

/** How much lower the protect sits (m). TUNED (new, #312). Knob `hoops.protectSinkM`. */
export const PROTECT_SINK_M = 0.06;
/** The sink eases in and out over this long (s; #312's HOLD_SEC). TUNED (new, #312). Knob `hoops.protectSinkSec`. */
export const PROTECT_SINK_SEC = 0.18;

/** The held sink one frame on (pure): toward `target` (m) over `sec`. */
export function stepSink(held: number, target: number, dt: number, sec: number): number {
  const h = held + (Math.max(0, target) - held) * Math.min(1, Math.max(0, dt) / Math.max(1e-3, sec));
  return h < 1e-5 && target <= 0 ? 0 : h;
}

const PER_SKELETON = new WeakMap<Skeleton, ProtectSink>();
export class ProtectSink {
  static for(scene: Scene, skeleton: Skeleton, root: TransformNode): ProtectSink {
    const had = PER_SKELETON.get(skeleton); if (had) return had;
    const p = new ProtectSink(scene, skeleton, root); PER_SKELETON.set(skeleton, p); return p;
  }
  private obs: Observer<Scene> | null;
  private readonly rig: SinkRig | null;
  private want = false;
  private held = 0;
  private ankleFloorY = Number.NaN;
  /** The sink drawn on the last frame (m): the probe's and the tests' read. */
  dropNow = 0;
  constructor(private scene: Scene, skeleton: Skeleton, private root: TransformNode) {
    this.rig = sinkRig(skeleton, root);
    this.obs = this.rig ? scene.onAfterAnimationsObservable.add(() => this.apply()) : null;
  }
  /** The mode, once a frame: is the player in the protect now? */
  hold(protecting: boolean): void { this.want = protecting; }
  dispose(): void { if (this.obs) { this.scene.onAfterAnimationsObservable.remove(this.obs); this.obs = null; } }

  private apply(): void {
    const rig = this.rig!;
    if (this.root.isDisposed()) { this.dispose(); return; }   // the body is gone (a new game spawns new ones)
    const dt = animDt(this.scene.getEngine().getDeltaTime() / 1000, this.scene.animationTimeScale);
    const on = feel('hoops.protectPostureOn', PROTECT_POSTURE_ON) >= 0.5;
    this.held = stepSink(this.held, on && this.want ? feel('hoops.protectSinkM', PROTECT_SINK_M) : 0, dt, feel('hoops.protectSinkSec', PROTECT_SINK_SEC));
    const { hipsY, lowAnkleY } = sinkRead(rig);
    if (!(this.held > 1e-4)) {   // the floor: the lowest the ankles go, drifting up slowly — learnt only while not sinking
      this.ankleFloorY = Number.isFinite(this.ankleFloorY) ? Math.min(lowAnkleY, this.ankleFloorY + 0.02 * dt) : lowAnkleY;
      this.dropNow = 0; return;
    }
    const floor = Number.isFinite(this.ankleFloorY) ? this.ankleFloorY : lowAnkleY;
    const target = Math.max(floor + DIP_MIN_HIPS_OVER_ANKLE, hipsY - this.held);
    if (target < hipsY) sinkHipsKeepFeet(rig, target, 0, floor);
    this.dropNow = Math.max(0, hipsY - target);
  }
}
