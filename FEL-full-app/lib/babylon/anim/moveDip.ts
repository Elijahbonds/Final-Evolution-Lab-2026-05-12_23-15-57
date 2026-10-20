// moveDip — THE BODY SINKS INTO THE MOVE (hoops-dip, owner 2026-10-20: "Yes, a dip pass next").
//
// Measured on the rig at #375 (1v1, hips height from the 300 ms before the flick to the move's own frames): the crossover, the
// behind-the-back and the momentum cross did not dip — they ROSE. Standing out of the 1v1's PROTECT crouch the hips went up 31.6 cm into
// a crossover; at a jog 15.5–18.7 cm. The v2 clips key their hips against the STANDING bind (hipsY −0.05 … −0.19), while the dribble loops
// carry the hips ~21 cm under bind and PROTECT ~37 cm under; the beat's fade pulled the body up to the clip's height and back down after.
// Under H2a's moveLegs at a jog (the loop's legs, "the hips stay the move's") the same rise carried the loop's feet up with it.
//
// So the move's hips are drawn RELATIVE to where the body was when the move began, and go DOWN from there:
//   hips = base − dip(k)        base: the hips' height (over the root) on the frame before the beat; k: the beat's progress 0..1;
//                               dip: the move's profile (DIP_PROFILE) × its depth (DIP_DEPTH_M), 0 at both ends;
// never under DIP_MIN_HIPS_OVER_ANKLE over the floor's ankle height (a body already in PROTECT has less room to sink). The clip's own
// lateral / forward hip motion (its x, z) is kept. Then each leg is re-solved (the two-bone IK the foot planter uses) so its ankle stays
// where every layer before this one put it — the clip's step, the loop's stride under moveLegs, the planter's pin — less the clip's rise
// over the base (the loop's own feet were drawn under the base, not under the clip's raised hips), never under the ankle's floor height;
// the foot keeps its world rotation. The knees bend; the feet do not move. After the beat the override fades out over DIP_RELEASE_SEC
// (the loop fades in from the beat's parked last frame, whose hips are the clip's).
//
// Visual only: nothing here reads or writes a speed, a timer, a window, a roll, the root, the ball or its path. The ball path is the
// carry's (root-relative), so the catch is where and when it was; only the body draws lower around it.
//
// Ordered on the after-animations pass: moveLegs (the loop's legs at a jog), then this, then the foot planter (CharacterLibrary mounts it at
// spawn) — so the planter pins the feet where this layer put them — then the posture layer, the motion layers and the carry, which read the
// lowered shoulders. Both this and moveLegs insert themselves first; the mode mounts this one just before MoveLegs.
import type { AnimationGroup, Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { animDt } from './motionLayers';
import { sinkRig, sinkRead, sinkHipsKeepFeet, type SinkRig } from './legSink';
export { ankleTarget } from './legSink';

/** The beats that dip: the crossover, the momentum cross and the behind-the-back (either hand's clip). */
export const DIP_BEAT = /^bball_(crossover|momentum_cross|behind_back)_(left|right)$/;
export type DipMove = 'crossover' | 'momentum_cross' | 'behind_back';
export const DIP_CLIPS: readonly string[] = (['crossover', 'momentum_cross', 'behind_back'] as const).flatMap((m) => [`bball_${m}_left`, `bball_${m}_right`]);
/** How far the hips go DOWN at the bottom of each move (m, from the height the body had when it began). (new) assumption: not felt yet. */
export const DIP_DEPTH_M: Readonly<Record<DipMove, number>> = { crossover: 0.10, momentum_cross: 0.12, behind_back: 0.08 };
/** The dip through each move, against the beat's progress k (0..1): the v2 clip's own keys (the push, the floor contact, the catch, the
 *  end) on its own clock — the body is lowest from the floor contact through the catch, and back at its height by the end. */
export const DIP_PROFILE: Readonly<Record<DipMove, readonly (readonly [number, number])[]>> = {
  crossover: [[0, 0], [0.19, 0.45], [0.45, 1], [0.71, 1], [1, 0]],          // CROSSOVER_V2: 0 / 0.08 / 0.19 / 0.30 / 0.42 s
  momentum_cross: [[0, 0], [0.2, 0.45], [0.44, 1], [0.71, 1], [1, 0]],      // MOMENTUM_CROSS_V2: 0 / 0.09 / 0.20 / 0.32 / 0.45 s
  behind_back: [[0, 0], [0.17, 0.4], [0.54, 1], [0.74, 1], [1, 0]],         // BEHIND_V2: 0 / 0.08 / 0.25 / 0.34 / 0.46 s
};
/** The hips never go lower than this over the ankles' floor height (m): PROTECT's crouch already sits ~0.52 m over it. (new) */
export const DIP_MIN_HIPS_OVER_ANKLE = 0.46;
/** After the beat the override fades out over this long (s): the loop's fade-in from the beat's parked last frame. (new) */
export const DIP_RELEASE_SEC = 0.15;

export const dipMoveOf = (clip: string): DipMove | null => { const m = DIP_BEAT.exec(clip); return m ? (m[1] as DipMove) : null; };
/** The dip (m, ≥ 0) at progress k through `move` (pure): the profile, smoothstepped between its keys, × the depth. */
export function dipAt(move: DipMove, k: number): number {
  const p = DIP_PROFILE[move]; const u = Math.min(1, Math.max(0, k));
  for (let i = 1; i < p.length; i++) {
    const [k0, v0] = p[i - 1], [k1, v1] = p[i];
    if (u <= k1) { const s = k1 > k0 ? (u - k0) / (k1 - k0) : 1; const e = s * s * (3 - 2 * s); return (v0 + (v1 - v0) * e) * DIP_DEPTH_M[move]; }
  }
  return 0;
}
/** The hips' height over the root this frame (pure): the base less the dip, never under the floor: ankle floor + DIP_MIN_HIPS_OVER_ANKLE. */
export function dipHips(baseY: number, dip: number, ankleFloorY: number): number {
  return Math.max(ankleFloorY + DIP_MIN_HIPS_OVER_ANKLE, baseY - Math.max(0, dip));
}
/** How much of the override this frame (pure): all of it while the beat runs, fading out linearly over DIP_RELEASE_SEC after it. */
export const releaseWeight = (sinceEndSec: number): number => (sinceEndSec <= 0 ? 1 : Math.max(0, 1 - sinceEndSec / DIP_RELEASE_SEC));

const PER_SKELETON = new WeakMap<Skeleton, MoveDip>();
/** One body's dip layer. `groupOf` is the animator's own name → group resolution (the clip the tree plays, on this rig). */
export class MoveDip {
  static for(scene: Scene, skeleton: Skeleton, root: TransformNode, groupOf: (name: string) => AnimationGroup | null): MoveDip {
    const had = PER_SKELETON.get(skeleton); if (had) return had;
    const d = new MoveDip(scene, skeleton, root, groupOf); PER_SKELETON.set(skeleton, d); return d;
  }
  private obs: Observer<Scene> | null;
  private readonly rig: SinkRig | null;
  private move: DipMove | null = null;
  private group: AnimationGroup | null = null;
  private baseY = NaN;          // the hips over the root when the beat began
  private lastHipsY = NaN;      // …and on the last frame the layer was idle
  private ankleFloorY = NaN;    // the lower ankle's height over the root, standing (a slow running minimum)
  private lastK = 0;
  private sinceEnd = Infinity;  // s since the beat ended (the release fade's clock)
  /** The dip drawn on the last frame (m) — the probe's and the tests' read. */
  dipNow = 0;

  constructor(private scene: Scene, skeleton: Skeleton, root: TransformNode, private groupOf: (name: string) => AnimationGroup | null) {
    this.rig = sinkRig(skeleton, root);
    // insert-first: the mode mounts this JUST BEFORE MoveLegs (which inserts itself first too), so the pass runs moveLegs → this → … → the
    // foot planter: the planter then sees the feet on the floor where the clip meant them and pins them (run after it, the clip's raised
    // feet had gone unpinned and were put back on the floor sliding — the rig's first after-run: 23–34 cm of planted slide)
    this.obs = this.rig ? scene.onAfterAnimationsObservable.add(() => this.apply(), undefined, true) : null;
  }
  dispose(): void { if (this.obs) { this.scene.onAfterAnimationsObservable.remove(this.obs); this.obs = null; } }

  /** The dip beat playing now on this body, and its progress (0..1); null when none. */
  private beat(): { move: DipMove; group: AnimationGroup; k: number } | null {
    for (const name of DIP_CLIPS) {
      const g = this.groupOf(name); if (!g || g.name !== name || !g.isPlaying || !(g.to > g.from)) continue;   // (the animator resolves a missing clip to a fallback — the idle loop is no dip)
      const f = (g as unknown as { animatables?: { masterFrame?: number }[] }).animatables?.[0]?.masterFrame;
      if (!Number.isFinite(f)) continue;
      const k = ((f as number) - g.from) / (g.to - g.from);
      if (k >= 0.999) continue;   // parked on its last frame (the tree's freezeAtEnd): over
      return { move: dipMoveOf(name)!, group: g, k };
    }
    return null;
  }

  private apply(): void {
    const rig = this.rig!;
    const dt = animDt(this.scene.getEngine().getDeltaTime() / 1000, this.scene.animationTimeScale);   // the drawn frame's animation clock
    const { hipsY, lowAnkleY } = sinkRead(rig);
    // the floor: the lowest the ankles go, drifting up slowly — learnt only outside a dip (inside one the clip's raised feet are not the floor)
    if (!this.group) this.ankleFloorY = Number.isFinite(this.ankleFloorY) ? Math.min(lowAnkleY, this.ankleFloorY + 0.02 * dt) : lowAnkleY;

    const b = this.beat();
    if (b && (b.group !== this.group || b.k < this.lastK - 0.05)) {   // a new beat (or the same clip restarted): the base is where the body was
      this.group = b.group; this.move = b.move; this.baseY = Number.isFinite(this.lastHipsY) && this.sinceEnd === Infinity ? this.lastHipsY : (Number.isFinite(this.baseY) ? this.baseY : hipsY);
    }
    if (b) { this.sinceEnd = 0; this.lastK = b.k; }
    else if (this.group) { this.sinceEnd += dt; if (this.sinceEnd >= DIP_RELEASE_SEC) { this.group = null; this.move = null; this.sinceEnd = Infinity; } }
    const w = this.group ? releaseWeight(b ? 0 : this.sinceEnd) : 0;
    if (!(w > 0) || !this.move || !Number.isFinite(this.baseY)) { this.dipNow = 0; this.lastHipsY = hipsY; return; }

    const dip = b ? dipAt(this.move, b.k) : 0;
    const target = hipsY + (dipHips(this.baseY, dip, this.ankleFloorY) - hipsY) * w;
    this.dipNow = Math.max(0, this.baseY - target);
    // the clip's rise over the base: the loop's / the stance's feet were drawn under the base, not under the clip's raised hips
    sinkHipsKeepFeet(rig, target, Math.max(0, hipsY - this.baseY) * w, this.ankleFloorY);
  }
}
