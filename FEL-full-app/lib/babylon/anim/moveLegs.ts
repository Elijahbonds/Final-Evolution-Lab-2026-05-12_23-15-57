// moveLegs — THE LEGS KEEP RUNNING UNDER A HANDLE MOVE (HOOPS-GAMEPLAY H2, 2026-10-16).
//
// The owner's ask (H2: "crossing moves look and feel like real change of direction", and the open "choppy / crab walky"): a crossover
// thrown at a jog played a one-shot clip whose feet stand in a dribble stance, while the body kept travelling at 3–4 m/s (the move's
// impulse on top). FootPlanting pins a planted foot until its drift reaches maxDrift (0.32 m) — 0.09 s of travel at a jog — and lets it
// slide from there: the hoops-motion 4c gate read 6–8 cm of planted-foot slide (p90) through every crossing move, and a body that stops
// running for half a second every time it crosses the ball over. In 2K (and in a real crossover at speed) the feet keep their stride;
// the move is the ball, the arms, the hips and the shoulders.
//
// So, while a handle move's beat plays on a body that is MOVING, its legs are the locomotion loop the tree would be playing — at the
// loop's stride-matched rate, from the phase it was at — blended over the move clip's legs by speed (none standing: the clip's own split
// stance and steps; all of it from LEGS_FULL_MPS). The layer writes the leg bones' local rotations right after the clips evaluate
// (insert-first on onAfterAnimationsObservable), so everything after it — LimbDrag (the legs only airborne), FootPlanting (which pins
// these stance feet; they sweep back under the body at the stride's own speed, so the pin holds), the posture layer — reads them as the
// clip's. The hips stay the move's (its yaw is the move). When the beat ends the tree restarts the loop AT this layer's phase
// (PlayOpts.phase01) and the layer fades out under its fade-in: the stride never resets.
//
// The pure parts (which beats, how much, the phase) are exported for the tests; the rig part evaluates the loop group's own leg
// animations (Animation.evaluate) — no clip is played, so the animator's one-current-clip rule is untouched.
import { Quaternion } from '@babylonjs/core';
import type { AnimationGroup, Observer, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import { findBone } from './boneLookup';

/** The leg bones the layer writes (the 22-bone FEL spec's names). */
export const MOVE_LEG_BONES = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'] as const;
/** The handle-move beats the legs run under: the crossing and feint moves a player throws on the move. Not the between-the-legs (its
 *  split stance IS the move — the ball goes through it), not the BTB slide (a committed sideways hop with its own skip), not the stops
 *  (the hesi, PAUSIN', the step-back: their feet plant on purpose), not the size-ups (standing). Both hands' names. */
export const MOVE_LEGS_BEAT = /^bball_(crossover|momentum_cross|behind_back|in_and_out|double_cross|shammgod)_(left|right)$/;
/** Below this ground speed the move's own legs (m/s); from LEGS_FULL_MPS all of the loop's. A jog is ~3.7 (GEARS_HOOPS). */
export const LEGS_ON_MPS = 1.0, LEGS_FULL_MPS = 2.4;
/** Dev: `?nolegs=1` turns the layer off (the A/B on one tree). */
export const MOVE_LEGS_OFF = process.env.NODE_ENV === 'development' && typeof location !== 'undefined' && /[?&]nolegs=1/.test(location.search);
/** The weight follows its target with this time constant (s): in as the move starts, out under the loop's fade-in after it. */
export const LEGS_TAU_SEC = 0.06;

/** How much of the loop's legs at this ground speed (pure): 0 standing, 1 from LEGS_FULL_MPS, smoothstep between. */
export function legsWeightFor(speedMps: number): number {
  if (!(speedMps > LEGS_ON_MPS)) return 0;
  const t = Math.min(1, (speedMps - LEGS_ON_MPS) / (LEGS_FULL_MPS - LEGS_ON_MPS));
  return t * t * (3 - 2 * t);
}
/** The weight's step toward its target (pure, frame-rate independent). */
export function stepLegsWeight(w: number, target: number, dt: number): number {
  if (!(dt > 0)) return w;
  return target + (w - target) * Math.exp(-dt / LEGS_TAU_SEC);
}
/** The loop's phase (0..1) after `dt` at playback `rate` on a loop `durSec` long (pure). */
export function advancePhase(phase: number, dt: number, rate: number, durSec: number): number {
  if (!(durSec > 1e-4) || !(dt > 0)) return phase;
  const p = phase + (dt * Math.max(0, rate)) / durSec;
  return p - Math.floor(p);
}

/** What the tree drives the layer with each frame: the loop under the move (or none) and its stride rate, the body's ground speed. */
export interface LegsDrive { loopClip: string | null; rate: number; speedMps: number; dtSec: number }

/**
 * One body's legs layer. `groupOf` resolves a clip name to this body's animation group (the animator's own resolution). Built once per
 * body; idle (no observer work beyond a weight check) whenever the body is not inside a move.
 */
const PER_SKELETON = new WeakMap<Skeleton, MoveLegs>();
export class MoveLegs {
  /** One layer per body: a mode that rebuilds its trees on a reload gets the body's existing layer back (gone with the skeleton). */
  static for(scene: Scene, skeleton: Skeleton, groupOf: (name: string) => AnimationGroup | null): MoveLegs {
    const had = PER_SKELETON.get(skeleton); if (had) return had;
    const l = new MoveLegs(scene, skeleton, groupOf); PER_SKELETON.set(skeleton, l);   // (it removes its own observer once its legs are disposed)
    return l;
  }
  private readonly legs: Set<TransformNode>;
  private obs: Observer<Scene> | null = null;
  private w = 0;
  private target = 0;
  private phase = 0;
  private group: AnimationGroup | null = null;
  private locked = false;
  private clip: string | null = null;
  private tracks: { node: TransformNode; evaluate: (frame: number) => unknown }[] = [];
  private readonly scratch = new Quaternion();

  constructor(private scene: Scene, skeleton: Skeleton, private groupOf: (name: string) => AnimationGroup | null) {
    this.legs = new Set(MOVE_LEG_BONES.map((n) => findBone(skeleton, n)?.getTransformNode()).filter((n): n is TransformNode => !!n));
    // insert-first: right after the clips evaluate, before every other after-animations layer (LimbDrag, FootPlanting, the posture)
    this.obs = scene.onAfterAnimationsObservable.add(() => this.apply(), undefined, true);
  }

  /** The current loop phase (0..1) — the tree restarts the loop here when the move ends. */
  get phase01(): number { return this.phase; }
  /** The weight the layer has the loop's legs at now. */
  get weight(): number { return this.w; }
  /** Is the layer writing (or fading out)? */
  get live(): boolean { return this.w > 1e-3 || this.target > 0; }

  /** The loop clip the layer is (or was last) running. */
  get loopClip(): string | null { return this.clip; }
  /** The phase a loop restarting after the move should take (PlayOpts.phase01): this layer's own for its own clip; for the other hand's
   *  twin (a `_left` loop is its right-hand loop MIRRORED at spawn, so the same stride pose sits half a cycle on) the phase + 0.5; for
   *  any other loop, none. Pure on its inputs. */
  static phaseFor(layerClip: string | null, phase: number, clip: string): number | undefined {
    if (!layerClip) return undefined;
    if (clip === layerClip) return phase;
    if (clip === `${layerClip}_left` || layerClip === `${clip}_left`) return (phase + 0.5) % 1;
    return undefined;
  }
  phaseFor(clip: string): number | undefined { return MoveLegs.phaseFor(this.clip, this.phase, clip); }
  /** Start under a move: seed the phase from the loop's own playhead (it is fading out under the beat) so the stride carries on. The
   *  loop is LOCKED for the move: the ball changing hands flips the tree's loop to its mirrored twin mid-move, and the twin's legs at
   *  the same phase are the other leg forward (the first probe: leg pops at every crossing). */
  begin(loopClip: string | null): void {
    this.locked = false;
    if (!loopClip) return;
    const g = this.bind(loopClip); this.locked = !!g;
    const f = (g as unknown as { animatables?: { masterFrame?: number }[] } | null)?.animatables?.[0]?.masterFrame;
    if (g && g.isPlaying && Number.isFinite(f) && g.to > g.from) this.phase = Math.min(0.999, Math.max(0, ((f as number) - g.from) / (g.to - g.from)));
  }

  /** Every frame from the tree while a move beat plays (loopClip null when the body would not be in a locomotion loop). */
  drive(d: LegsDrive): void {
    const g = d.loopClip ? (this.locked ? this.group : this.bind(d.loopClip)) : null;
    if (g && !this.locked) this.locked = true;
    this.target = g && !MOVE_LEGS_OFF ? legsWeightFor(d.speedMps) : 0;
    this.w = stepLegsWeight(this.w, this.target, d.dtSec);
    if (g) this.phase = advancePhase(this.phase, d.dtSec, d.rate, this.durSec(g));
  }
  /** The move is over: fade out (the tree has restarted the loop at phase01). Keeps the phase running while it fades. */
  end(d: Omit<LegsDrive, 'loopClip'>): void {
    this.target = 0; this.locked = false;
    this.w = stepLegsWeight(this.w, 0, d.dtSec);
    if (this.group) this.phase = advancePhase(this.phase, d.dtSec, d.rate, this.durSec(this.group));
    if (this.w < 1e-3) this.w = 0;
  }

  dispose(): void { if (this.obs) { this.scene.onAfterAnimationsObservable.remove(this.obs); this.obs = null; } }

  private durSec(g: AnimationGroup): number {
    const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    return (g.to - g.from) / fps;
  }
  private bind(loopClip: string): AnimationGroup | null {
    if (loopClip === this.clip) return this.group;
    const g = this.groupOf(loopClip);
    this.clip = loopClip; this.group = g;
    this.tracks = g ? g.targetedAnimations
      .filter((ta) => this.legs.has(ta.target as TransformNode) && ta.animation.targetProperty === 'rotationQuaternion')
      .map((ta) => ({ node: ta.target as TransformNode, evaluate: (frame: number) => ta.animation.evaluate(frame) })) : [];
    return g;
  }
  private apply(): void {
    if (this.w <= 1e-3 || !this.group || !this.tracks.length) return;
    if (this.tracks[0].node.isDisposed()) { this.dispose(); return; }   // the body is gone (a reload rebuilt it)
    const g = this.group, frame = g.from + this.phase * (g.to - g.from);
    for (const t of this.tracks) {
      const q = t.evaluate(frame) as Quaternion | null;
      const cur = t.node.rotationQuaternion;
      if (!q || !cur) continue;
      Quaternion.SlerpToRef(cur, q, this.w, this.scratch);
      cur.copyFrom(this.scratch);
    }
  }
}
