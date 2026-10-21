// DrawnFacing — NO ONE-FRAME FACING SNAPS ON A HOOPS BODY (hoops-dip movement pass, owner 2026-10-20: "turn smoothing everywhere in hoops,
// including the momentum cross's 55° snap, smoothed over about 0.12 s").
//
// The movement writes the facing in one frame on a cut — DribbleController.cutTo (the momentum cross −55°, the drift, the drop step, the
// step-back), the left-stick reversal's flip (−118° to −129°) — and the modes draw the root at that facing the same frame. The cut's
// DIRECTION and SPEED are the movement's (CourtMovement.vel) and stay exactly as they are; only the root's drawn yaw is filtered here:
//   · a turn the movement already slews (its own turn rate: a few degrees a frame) is followed EXACTLY — no lag on an ordinary turn;
//   · a jump bigger than SNAP_MIN_RAD in one frame is spread over TURN_SMOOTH_SEC at a constant rate (the jump's size / the time), and any
//     further turn while it runs is folded into the same slew;
//   · a teleport (the body moved more than TELEPORT_M in a frame: a reset, a new possession) takes the new facing at once.
// Pure state + one step, and the hook (DrawnFacing.for) that draws a body's root at it for the render only (see the class).

import { Quaternion, Vector3 } from '@babylonjs/core';
import type { Observer, Scene, TransformNode } from '@babylonjs/core';
import { animDt } from '../anim/motionLayers';

/** The smoothing time of a facing snap (s). TUNED (new): the owner's "about 0.12 s". */
export const TURN_SMOOTH_SEC = 0.12;
/** A one-frame change of the facing bigger than this is a snap (rad; 15°). The movement's own slewed turns stay under it at any frame rate
 *  the game runs (CourtMovement's turn rate at a sprint is ~5°/frame at 60 fps). */
export const SNAP_MIN_RAD = (15 * Math.PI) / 180;
/** A body that moved further than this in one frame was placed, not run: its facing is taken at once (m). */
export const TELEPORT_M = 0.8;

export interface DrawnFacingState { yaw: number; rate: number; x: number; z: number; seeded: boolean }
export const drawnFacingIdle = (): DrawnFacingState => ({ yaw: 0, rate: 0, x: 0, z: 0, seeded: false });

const wrap = (a: number): number => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** One frame: the movement's facing `target`, the body's position (x, z), dt. Mutates and returns the state; draw the root at `.yaw`. */
export function stepDrawnFacing(s: DrawnFacingState, target: number, x: number, z: number, dt: number): DrawnFacingState {
  if (s.seeded && !(dt > 0)) return s;   // a frame with no time in it (a pause): nothing turns
  const placed = !s.seeded || Math.hypot(x - s.x, z - s.z) > TELEPORT_M;
  s.x = x; s.z = z;
  if (placed) { s.yaw = target; s.rate = 0; s.seeded = true; return s; }
  const d = wrap(target - s.yaw);
  if (s.rate === 0 && Math.abs(d) <= SNAP_MIN_RAD) { s.yaw = target; return s; }   // an ordinary turn: exactly the movement's
  s.rate = Math.max(s.rate, Math.abs(d) / TURN_SMOOTH_SEC);   // a snap: its size over TURN_SMOOTH_SEC; a further turn mid-slew speeds it so
                                                               // it still ends TURN_SMOOTH_SEC after the last jump
  const step = s.rate * dt;
  if (Math.abs(d) <= step) { s.yaw = target; s.rate = 0; } else s.yaw = wrap(s.yaw + Math.sign(d) * step);
  return s;
}

/**
 * The modes' one-line hook: this body's root is DRAWN at the smoothed facing and is the movement's again for everything else.
 *
 * The game reads the root's yaw all through its update — the crossover's side against the facing before the cut, the stance's stick, the
 * contest's facing, the spin's contact, the facing a landing hands back to the dribble — so a smoothed root would have leaked into play for
 * the 0.12 s after a cut. Instead the drawn yaw is put on the root only for the frame's DRAWING: at the start of the scene's render (before
 * the animations, so the clips, the layers, the carry's root-relative ball and the camera all draw it), and the movement's yaw is put back
 * after the render, before the game's next update. A root turned by something else during the render is left as that wrote it.
 */
const yawOf = (n: TransformNode): number => (n.rotationQuaternion ? n.rotationQuaternion.toEulerAngles().y : n.rotation.y);
const PER_NODE = new WeakMap<TransformNode, DrawnFacing>();
export class DrawnFacing {
  static for(scene: Scene, root: TransformNode): DrawnFacing {
    const had = PER_NODE.get(root); if (had) return had;
    const d = new DrawnFacing(scene, root); PER_NODE.set(root, d); return d;
  }
  private s = drawnFacingIdle();
  private before: Observer<Scene> | null;
  private after: Observer<Scene> | null;
  private saved: { y: number; q: Quaternion | null; drawn: number } | null = null;
  /** The drawn yaw's lag behind the movement's on the last frame (rad) — the probe's and the tests' read. */
  lag = 0;
  constructor(private scene: Scene, private root: TransformNode) {
    this.before = scene.onBeforeAnimationsObservable.add(() => this.draw(), undefined, true);
    this.after = scene.onAfterRenderObservable.add(() => this.restore());
  }
  dispose(): void {
    if (this.before) this.scene.onBeforeAnimationsObservable.remove(this.before);
    if (this.after) this.scene.onAfterRenderObservable.remove(this.after);
    this.before = this.after = null;
  }
  private draw(): void {
    if (this.root.isDisposed()) { this.dispose(); return; }
    this.saved = null;
    const dt = animDt(this.scene.getEngine().getDeltaTime() / 1000, this.scene.animationTimeScale);
    const yaw = yawOf(this.root);
    const drawn = stepDrawnFacing(this.s, yaw, this.root.position.x, this.root.position.z, dt).yaw;
    const d = wrap(drawn - yaw); this.lag = d;
    if (Math.abs(d) < 1e-6) return;
    this.saved = { y: this.root.rotation.y, q: this.root.rotationQuaternion?.clone() ?? null, drawn };
    this.root.rotation.y = this.root.rotation.y + d;
    // a world turn about the vertical on top of whatever the root holds (Babylon's a.multiply(b): a outer — the world frame for a root)
    if (this.root.rotationQuaternion) this.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), d).multiply(this.root.rotationQuaternion);
    this.root.computeWorldMatrix(true);
  }
  private restore(): void {
    const sv = this.saved; this.saved = null;
    if (!sv || this.root.isDisposed()) return;
    if (Math.abs(wrap(yawOf(this.root) - sv.drawn)) > 1e-3) { this.s = drawnFacingIdle(); return; }   // turned by something else in the render: theirs
    this.root.rotation.y = sv.y;
    if (sv.q && this.root.rotationQuaternion) this.root.rotationQuaternion.copyFrom(sv.q);
    this.root.computeWorldMatrix(true);
  }
}
