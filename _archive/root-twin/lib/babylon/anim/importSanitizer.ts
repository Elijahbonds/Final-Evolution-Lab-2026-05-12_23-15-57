// importSanitizer — kills the two visual regressions at their source:
//   IN-THE-GROUND: imported GLB clips key Hips.position in the clip's own
//     space (below our floor). Strip position tracks from IMPORTED groups —
//     rotation-only imports; our authored clips keep their tuned hip bobs.
//   T-POSE RETURNS: a finished non-looping group drops its weights → bind
//     pose. neverBindPose() makes every non-loop play fall through to the
//     mode's base loop automatically.
// Plus GroundLock: per-frame clamp so sinking is impossible regardless of
// what any clip does.

import type { AnimationGroup, Scene, Skeleton, TransformNode } from '@babylonjs/core';
import type { CharacterAnimator, PlayOpts } from './CharacterAnimator';

/** Names of clips WE author (position tracks are trusted). */
const AUTHORED = new Set([
  'idle_stand', 'strafe_left', 'strafe_right', 'jump_up', 'jump_land',
  'dunk_charge_gather', 'dunk_launch', 'dunk_360_eastbay', 'dunk_score_hang',
  'dunk_land_crouch', 'football_juke_left', 'football_juke_right',
  'football_spin_move', 'football_tackled_fall', 'karate_hit_react', 'karate_knockdown',
]);

/** 1) Strip position animations from imported groups (call in spawn, after
 *     name restoration, before the animator is constructed). */
export function sanitizeImportedGroups(groups: AnimationGroup[]): void {
  for (const g of groups) {
    if (AUTHORED.has(g.name)) continue;
    const keep = g.targetedAnimations.filter(
      (ta) => ta.animation.targetProperty !== 'position',
    );
    if (keep.length === g.targetedAnimations.length) continue;
    const dropped = g.targetedAnimations.length - keep.length;
    // Rebuild the group's animation list rotation-only
    const pairs = keep.map((ta) => ({ anim: ta.animation, target: ta.target }));
    while (g.targetedAnimations.length) {
      g.removeTargetedAnimation(g.targetedAnimations[0].animation);
    }
    for (const p of pairs) g.addTargetedAnimation(p.anim, p.target);
    console.info(`[FEL-ANIM] sanitized "${g.name}": dropped ${dropped} position track(s)`);
  }
}

/** 2) Bind-pose is unreachable: wrap play() so every non-loop falls through
 *     to the base loop unless the caller chains something else. */
export function neverBindPose(animator: CharacterAnimator, baseLoop: string): void {
  // Idempotent: CharacterLibrary.spawn already wraps every animator, and modes
  // may call this again. Wrapping twice would double-run onEnd chains, so guard.
  const tagged = animator as CharacterAnimator & { __neverBindPose?: boolean };
  if (tagged.__neverBindPose) return;
  tagged.__neverBindPose = true;
  const rawPlay = animator.play.bind(animator);
  animator.play = (name: string, opts: PlayOpts = {}) => {
    if (opts.loop) return rawPlay(name, opts);
    const chainedEnd = opts.onEnd;
    return rawPlay(name, {
      ...opts,
      onEnd: () => {
        if (chainedEnd) chainedEnd();
        else rawPlay(baseLoop, { loop: true, fadeSec: 0.12 });
      },
    });
  };
}

/** 3) GroundLock — physical floor for every character, every frame. */
export class GroundLock {
  private entries: { root: TransformNode; hips: TransformNode | null; minHipsY: number }[] = [];
  private obs: ReturnType<Scene['onBeforeRenderObservable']['add']> | null = null;

  constructor(private scene: Scene, private floorY = 0) {
    this.obs = scene.onBeforeRenderObservable.add(() => this.tick());
  }

  track(root: TransformNode, skeleton: Skeleton): void {
    const hips = skeleton.bones.find((b) => b.name === 'Hips')?.getTransformNode() ?? null;
    // 45% of bind-pose hip height = deepest legal crouch
    const minHipsY = hips ? hips.position.y * 0.45 : 0;
    this.entries.push({ root, hips, minHipsY });
  }
  untrack(root: TransformNode): void {
    this.entries = this.entries.filter((e) => e.root !== root);
  }
  /** Temporarily allow sinking (KO despawn effect). */
  release(root: TransformNode): void { this.untrack(root); }

  private tick(): void {
    for (const e of this.entries) {
      if (e.root.position.y < this.floorY) e.root.position.y = this.floorY;
      if (e.hips && e.hips.position.y < e.minHipsY) e.hips.position.y = e.minHipsY;
    }
  }

  dispose(): void {
    if (this.obs) this.scene.onBeforeRenderObservable.remove(this.obs);
    this.entries = [];
  }
}

// WIRING
// CharacterLibrary.spawn — after suffix-name restoration (M30):
//     sanitizeImportedGroups(inst.animationGroups);
//   after animator construction, per character type:
//     neverBindPose(animator, baseLoopFor(modeFamily));  // e.g. 'karate_idle_stance' | 'idle_stand'
// ModeHarness — once per scene:
//     const groundLock = new GroundLock(scene);           // expose on ctx
//   every spawn: ctx.groundLock.track(spawn.root, spawn.skeleton);
//   KO despawn effect: groundLock.release(root) before the sink tween.
