// SkinningGuard v4 — v3 plus "was it DRAWN?" (lane/kvs-skin, 2026-10-16).
//
// v2 WORKED, AND THE NUMBERS SAY SO
// Before v2, Karate Endless logged four simultaneous SKINNING STALLs on
// visibly-animating characters. On this build, driven through the start gate
// and actually played, it logs ONE: char_264. Four false positives to one is
// the fix doing its job.
//
// v3: A HELD POSE IS NOT A STALL
// The karate run that produced that last one ended in a results screen ("WAVE 2
// REACHED · 5 KO"). A knocked-out fighter holds its final death-clip pose:
// the AnimationGroup is still attached and still reports as playing, but its
// playhead is parked on the last frame. v3 asks the question that separates the
// two cases: IS THE PLAYHEAD ADVANCING? A KO'd, paused, or held-pose character
// means the clip is not advancing either — nothing is broken.
//
// v4: A BODY NOBODY DREW IS NOT A STALL EITHER (Who Scene It, char_65)
// Who Scene It flagged `char_65` as a SKINNING STALL and forced CPU skinning on it. It looked like a near-still idle
// tripping the check. It was not: measured on the phone profile, the six sampled bones of char_65 moved by exactly 0
// over the 45 frames, and the same six on a body that WAS drawn moved by up to 0.99 (arms) in the same window. char_65
// was a contestant standing outside the portrait phone's frame: its meshes were enabled, but never in the scene's
// active-mesh list. A skeleton's bone matrices are computed by `Skeleton.prepare()`, and the scene calls that only for a
// skinned mesh it selects to draw. An undrawn body's bones cannot move, whatever its clip is doing, so "no bone
// moved" was a statement about the CAMERA, not about the skinning pipeline. The cost of the false alarm is real: the
// body is switched to CPU skinning for good (computeBonesUsingShaders = false), about 250 KB of garbage a frame
// whenever it is on screen after that.
//
// v4 judges only a body that was drawn, and counts the 45 frames from when it was:
//   1. WATCH until a skinned mesh of the body is in the active-mesh list. Then take the baseline (the bones' and their
//      nodes' world matrices, the playhead). It stops watching after MAX_WATCH_FRAMES; a body nobody ever sees is never judged.
//   2. After FRAMES_TO_WAIT further DRAWN frames, judge: nothing playing → say nothing; playhead parked → say nothing.
//   3. A STALL is the skeleton not following its own animation: no sampled bone moved while the animated NODES they
//      are linked to did. A clip that moves no node past EPSILON (a near-still idle, a breath) leaves nothing for
//      the skeleton to follow, so there is nothing to call a stall — stillness is correct, say nothing.
// The baseline is taken after the first drawn frame's prepare, not at spawn: before it, any pose differs from the
// not-yet-evaluated bones, so a drawn body always read as "moved" and a real stall after its first frame could not be seen.

import type { AbstractMesh, Matrix, Scene, Skeleton } from '@babylonjs/core';
import { boneNode, findBone } from './boneLookup';

const warnedIds = new Set<string>();
/** Drawn frames a body must be seen for before it is judged. */
export const SKINNING_GUARD_FRAMES = 45;
/** Frames a body may go undrawn before the guard stops watching it (about a minute at 60 fps). */
export const SKINNING_GUARD_MAX_WATCH = 3600;
const FRAMES_TO_WAIT = SKINNING_GUARD_FRAMES;
const EPSILON = 1e-3;
/** How far a sampled NODE must move for the clip to count as moving anything (10x EPSILON: a node's world matrix and its bone's are in different spaces, so a margin keeps a breath from reading as motion). */
const NODE_MOVED = 10 * EPSILON;

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
      .map((n) => findBone(skeleton, n))
      .filter((b): b is NonNullable<typeof b> => !!b);

    if (bones.length === 0) {
      console.warn(`[FEL-ANIM] SkinningGuard: none of the sampled bones exist on "${id}" — `
        + 'check the rig against AvatarSkeletonSpec.md (names are UNPREFIXED).');
      return;
    }

    // the meshes the skeleton is prepared for, biggest first (the body is drawn whenever the character is: the scan ends at the first hit)
    const skinned = meshes.filter((m) => m.skeleton).sort((a, b) => b.getTotalVertices() - a.getTotalVertices());
    const nodes = bones.map((b) => b.getTransformNode());
    const worldOf = (n: { getWorldMatrix(): Matrix } | null | undefined): Matrix | null => n ? n.getWorldMatrix().clone() : null;
    let baseline: Matrix[] = [];
    let nodeBaseline: (Matrix | null)[] = [];
    let frameAtStart: number | null = null;
    let watched = 0, drawn = 0;

    /** Did the scene select a skinned mesh of this body to draw this frame? Only then did its skeleton get prepared. */
    const isDrawn = (): boolean => {
      const active = scene.getActiveMeshes();
      for (const m of skinned) if (m.isEnabled() && m.isVisible && active.indexOf(m) !== -1) return true;
      return false;
    };

    const obs = scene.onAfterRenderObservable.add(() => {
      watched++;
      if (!isDrawn()) {
        // nobody has seen this body (a hidden seat, a podium past the frame): its bones cannot have moved. Keep watching, for a while.
        if (watched >= SKINNING_GUARD_MAX_WATCH) scene.onAfterRenderObservable.remove(obs);
        return;
      }
      if (drawn++ === 0) {
        // the first drawn frame: its prepare has run, so these are the bones as they are once evaluated
        baseline = bones.map((b) => b.getWorldMatrix().clone());
        nodeBaseline = nodes.map(worldOf);
        frameAtStart = safeFrame(clipFrame);
        return;
      }
      if (drawn <= FRAMES_TO_WAIT) return;
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

      // 3. No sampled bone moved in a drawn body whose clip is advancing. Is that the skeleton's fault, or is the clip simply
      //    not moving anything (a near-still idle)? The animated nodes the bones are linked to answer it: a stall is the
      //    nodes moving and the bones not following. Bones with no node (or no way to read one) cannot be asked; if none
      //    can, the playhead has already said the clip is advancing (check 2) and that is all the evidence there is.
      const nodeMoved = nodes.map((n, i) => (n && nodeBaseline[i] ? !n.getWorldMatrix().equalsWithEpsilon(nodeBaseline[i] as Matrix, NODE_MOVED) : null));
      const askable = nodeMoved.filter((v) => v !== null);
      if (askable.length > 0 && !askable.some(Boolean)) {
        console.debug(`[FEL-ANIM] SkinningGuard: "${id}" — the clip advanced but moved none of the ${askable.length} sampled nodes past ${NODE_MOVED}; `
          + 'a near-still pose, nothing for the skeleton to follow. Not a stall. No action taken.');
        return;
      }

      if (warnedIds.has(id)) return;
      warnedIds.add(id);
      console.error(
        `[FEL-ANIM] SKINNING STALL on "${id}" — NONE of ${bones.length} sampled bones `
        + `(${bones.map((b) => b.name).join(', ')}) moved in ${FRAMES_TO_WAIT} DRAWN frames `
        + `while a clip was playing AND advancing${frameAtStart !== null ? ` (frame ${frameAtStart.toFixed(1)} → ${frameNow?.toFixed(1)})` : ''}`
        + `${askable.length ? ' and the nodes they follow did move' : ''}. `
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
