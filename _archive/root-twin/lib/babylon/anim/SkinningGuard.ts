// SkinningGuard v3 — REPLACES the M68 v2 file.
//
// v2 WORKED, AND THE NUMBERS SAY SO
// Before v2, Karate Endless logged four simultaneous SKINNING STALLs on
// visibly-animating characters. On this build, driven through the start gate
// and actually played, it logs ONE: char_264. Four false positives to one is
// the fix doing its job.
//
// BUT THAT LAST ONE IS STILL WRONG, AND IT IS A DIFFERENT BUG
// The karate run that produced it ended in a results screen ("WAVE 2
// REACHED · 5 KO"). A knocked-out fighter holds its final death-clip pose:
// the AnimationGroup is still attached and still reports as playing, but its
// playhead is parked on the last frame. Every bone is legitimately frozen —
// the character is supposed to be lying there. v2 asks "is a clip playing?",
// which is true, so it accuses the skinning pipeline of a stall.
//
// v3 asks the question that actually separates the two cases: IS THE
// PLAYHEAD ADVANCING? A real skinning stall means the clip is advancing and
// the bones are not. A KO'd, paused, or held-pose character means the clip
// is not advancing either — nothing is broken, and there is nothing to fix
// by paying for CPU skinning.
//
// The guard is now: every sampled bone frozen AND a clip playing AND that
// clip's playhead moved during the window. All three, or it says nothing.

import type { AbstractMesh, Scene, Skeleton } from '@babylonjs/core';

const warnedIds = new Set<string>();
const FRAMES_TO_WAIT = 45;
const EPSILON = 1e-3;

/** Sampled across limbs on purpose — an idle clip may hold the spine still,
 *  but it will not hold ALL of these still. */
const SAMPLE_BONES = ['Spine', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'Head'];

export const SkinningGuard = {
  /**
   * Call once per spawn, right after the character's base loop starts.
   *
   * @param isAnimating Whether a clip is currently playing.
   * @param clipFrame   Current playhead position of that clip. Supplying it
   *                    is what lets the guard tell a stall from a held pose;
   *                    without it v3 falls back to v2 behaviour and may
   *                    still report a KO'd character.
   */
  verify(
    scene: Scene,
    id: string,
    meshes: AbstractMesh[],
    skeleton: Skeleton,
    isAnimating?: () => boolean,
    clipFrame?: () => number,
  ): void {
    const bones = SAMPLE_BONES
      .map((n) => skeleton.bones.find((b) => b.name === n))
      .filter((b): b is NonNullable<typeof b> => !!b);

    if (bones.length === 0) {
      console.warn(`[FEL-ANIM] SkinningGuard: none of the sampled bones exist on "${id}" — `
        + 'check the rig against AvatarSkeletonSpec.md (names are UNPREFIXED).');
      return;
    }

    const baseline = bones.map((b) => b.getWorldMatrix().clone());
    const frameAtStart = safeFrame(clipFrame);
    let frames = 0;

    const obs = scene.onAfterRenderObservable.add(() => {
      frames++;
      if (frames < FRAMES_TO_WAIT) return;
      scene.onAfterRenderObservable.remove(obs);

      // 1. Nothing playing → stillness is correct. Say nothing.
      if (isAnimating && !isAnimating()) return;

      // 2. Playhead parked → held pose (KO, victory freeze, paused, a clip
      //    sitting on its last frame). Bones SHOULD be still. Say nothing.
      const frameNow = safeFrame(clipFrame);
      if (frameAtStart !== null && frameNow !== null && Math.abs(frameNow - frameAtStart) < 1e-4) {
        console.debug(`[FEL-ANIM] SkinningGuard: "${id}" — clip playhead parked at ${frameNow.toFixed(2)}; `
          + 'held pose, not a stall. No action taken.');
        return;
      }

      const moved = bones.map((b, i) => !b.getWorldMatrix().equalsWithEpsilon(baseline[i], EPSILON));
      const movedCount = moved.filter(Boolean).length;

      if (movedCount === bones.length) return;                    // fully healthy

      if (movedCount > 0) {
        // Partial freeze is normal — a guard stance holds the spine. Report
        // and take NO action; acting here is what v1 got wrong.
        const still = bones.filter((_, i) => !moved[i]).map((b) => b.name);
        console.debug(`[FEL-ANIM] SkinningGuard: "${id}" — ${movedCount}/${bones.length} sampled bones moving `
          + `(static: ${still.join(', ')}). Normal for clips that hold part of the body still; no action taken.`);
        return;
      }

      // 3. Total freeze, clip playing, playhead advancing → a real stall.
      if (warnedIds.has(id)) return;
      warnedIds.add(id);
      console.error(
        `[FEL-ANIM] SKINNING STALL on "${id}" — NONE of ${bones.length} sampled bones `
        + `(${bones.map((b) => b.name).join(', ')}) moved in ${FRAMES_TO_WAIT} rendered frames `
        + `while a clip was playing AND advancing${frameAtStart !== null ? ` (frame ${frameAtStart.toFixed(1)} → ${frameNow?.toFixed(1)})` : ''}. `
        + 'Forcing CPU skinning for this character.',
      );
      for (const m of meshes) {
        m.computeBonesUsingShaders = false;
        m.markAsDirty('material');
      }
    });
  },

  /** Test hook — lets a fresh run re-report. */
  reset(): void { warnedIds.clear(); },
};

function safeFrame(fn?: () => number): number | null {
  if (!fn) return null;
  try { const v = fn(); return Number.isFinite(v) ? v : null; } catch { return null; }
}

// WIRING — CharacterLibrary.spawn(), replacing the M68 call:
//   SkinningGuard.verify(
//     scene, id, meshes, skeleton,
//     () => animator.isPlaying,
//     () => animator.currentFrame,   // ← NEW, and the whole point of v3
//   );
//
// CharacterAnimator needs the matching accessor next to the `isPlaying` one
// Abacus already added:
//   get currentFrame(): number {
//     const g = this.activeGroup;                      // the playing AnimationGroup
//     return g?.animatables?.[0]?.masterFrame ?? g?.getCurrentFrame?.() ?? 0;
//   }
// Return 0 when nothing is active — a parked playhead reads as "not
// advancing", which is exactly the conservative answer.
