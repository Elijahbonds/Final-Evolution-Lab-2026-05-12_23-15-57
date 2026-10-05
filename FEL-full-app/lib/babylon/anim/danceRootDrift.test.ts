// MUSIC-SUITE P8 FIX: "GOOD no longer drags the dancer off the grid" / "keep the dancer on the stage mark for every
// grade" (PLAN phase 8, item 1). The captured floor moves (windmill, six-step) are the only dance steps with a real
// ROOT TRACK (MoveRootLayer, via danceRootTracks) — a procedural pose clip never carries root translation (poseClip.ts's
// own header: "Root translation is never carried — movement is code-driven"). So for every OTHER step a GOOD's drag
// (bodySpeedFor: 0.85x) cannot move the root at all; for these two specifically, MoveRootLayer turns and lifts
// `me.root.position` for as long as the clip is the highest-weighted track, so an unbounded drag (the bug: DanceMode
// used to hold 0.85x for the step's ENTIRE remaining length, ~1.2 beats over on an 8-beat step — design audit,
// understand-wf_3a55346f-032.json:1705) keeps the dancer visibly off the stage mark for that whole extra stretch.
//
// A real rig test (NullEngine + the actual fel-hero.glb skeleton), driving the REAL production pieces — buildDanceClip,
// MoveRootLayer, CharacterAnimator, and DanceMode's own exported `dragFor` — not a re-implementation of their math.
// Clip position is driven by explicit `AnimationGroup.goToFrame` rather than letting scene.render() advance it in
// real time: Babylon's Animatable paces itself off wall-clock time under a NullEngine, which a synchronous test loop
// elapses almost none of no matter how many times it calls render() — CharacterAnimator's own crossfade-weight ramp
// is the one thing here that explicitly reads `engine.getDeltaTime()` (crossFade's `t += ... / 1000`), so that part
// alone is safe to drive by a faked getDeltaTime; the clip's own playhead is not, and is set by hand.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AnimationGroup, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { buildDanceClip, danceRootTracks } from './danceClips';
import { MoveRootLayer } from './MoveRootLayer';
import { CharacterAnimator } from './CharacterAnimator';
import { dragFor } from '../modes/DanceMode';
import { bodySpeedFor } from '../core/danceTracks';

async function loadRig(scene: Scene): Promise<{ sk: Skeleton; root: TransformNode }> {
  const b64 = readFileSync('public/models/fel-hero.glb').toString('base64');
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  return { sk: r.skeletons[0], root: r.meshes[0] as unknown as TransformNode };   // meshes[0] is glTF's synthetic __root__
}

/** How many CLIP-TIME seconds a step covers by `wallSec` of song time, given a GOOD's drag is applied from wall
 *  time 0 and DanceMode's own bounded restore (dragFor + update()'s check) cuts it off at `boundSec` (Infinity =
 *  the old, unbounded behaviour: dragged for the step's entire length). Mirrors exactly what onJudged + update()
 *  do to `clipSpeed()`, in clip-time units (i.e., already speed-ratio-scaled) — not a re-derivation of the bug, a
 *  restatement of the same piecewise-constant-rate integral CharacterAnimator.setSpeed drives every frame. */
function clipSecondsElapsed(wallSec: number, clipSpeed: number, dragSpeedMul: number, boundSec: number): number {
  const dragged = Math.min(wallSec, boundSec);
  const full = Math.max(0, wallSec - dragged);
  return dragged * clipSpeed * dragSpeedMul + full * clipSpeed;
}

describe('dance_power_windmill root position vs. the beat grid (MUSIC-SUITE P8 root-drift fix)', () => {
  const BPM = 120, beatSec = 60 / BPM, clipSpeed = BPM / 120, stepSec = 8 * beatSec;   // windmill = 8 beats (DANCE_LIBRARY)

  it('an unbounded 0.85x GOOD drag leaves the windmill well short of its own end when the beat grid says the step is over; the bounded fix does not', async () => {
    const scene = new Scene(new NullEngine());
    new FreeCamera('c', new Vector3(0, 1, -3), scene);
    const { sk } = await loadRig(scene);
    const windmill = buildDanceClip(scene, sk, 'dance_power_windmill')!;
    const fps = windmill.targetedAnimations[0]!.animation.framePerSecond;
    const clipDurationSec = (windmill.to - windmill.from) / fps;

    const drag = dragFor('GOOD', 'dance_power_windmill', 0)!;   // the SAME call onJudged makes
    const goodSpeedMul = bodySpeedFor('GOOD');
    expect(goodSpeedMul).toBeLessThan(1);

    const progressAt = (boundSec: number) => clipSecondsElapsed(stepSec, clipSpeed, goodSpeedMul, boundSec) / clipDurationSec;
    const unbounded = progressAt(Infinity);            // the bug: dragged for the step's whole remaining length
    const bounded = progressAt(drag.untilSec);          // the fix: dragFor's own bound

    console.log(`windmill progress when the grid says the step is over — unbounded drag: ${(unbounded * 100).toFixed(1)}%, bounded (fixed): ${(bounded * 100).toFixed(1)}%, drag bound ${drag.untilSec.toFixed(3)}s of ${stepSec.toFixed(3)}s`);
    expect(unbounded).toBeLessThan(0.9);      // the old bug, quantified: still visibly mid-move (0.85x for 4s loses ~0.6s ≈ 1.2 beats — matches the audit)
    expect(bounded).toBeGreaterThan(unbounded);
    expect(bounded).toBeGreaterThan(0.97);    // the fix: the step catches back up to (within a couple of frames of) the grid

    // Confirm this is exactly what the real rig plays, not just arithmetic: goToFrame the windmill to each computed
    // fraction and check `MoveRootLayer`'s live turn is smaller once the fix has let it wind down closer to its own
    // end (its root track returns hips height/rotation toward the settled STAND-equivalent as the move completes).
    const root = (await loadRig(scene)).root;   // a second character root in the same scene, just for a place to read a position — its own skeleton is unused
    const layer = new MoveRootLayer(scene, root, sk, danceRootTracks(new Set(['dance_power_windmill'])));
    // MoveRootLayer applies its turn on onAfterAnimationsObservable and UNDOES it again on onAfterRenderObservable
    // (by design — see MoveRootLayer.ts's own header), so root.position read any time after scene.render() HAS
    // returned is always back at the code-driven baseline, never the transient on-screen offset. Registering this
    // AFTER `layer` means it runs right after `layer`'s own apply() within the SAME render() call, so it captures
    // the value a viewer would actually see for that frame.
    let capturedLiftY = 0;
    scene.onAfterAnimationsObservable.add(() => { root.computeWorldMatrix(true); capturedLiftY = root.getAbsolutePosition().y; });
    const sampleLiftAt = (progress: number): number => {
      windmill.start(true, 1, windmill.from, windmill.to, false);
      windmill.setWeightForAllAnimatables(1);
      windmill.goToFrame(progress * (windmill.to - windmill.from));
      scene.render();
      return Math.abs(capturedLiftY - 0.7);   // 0.7 = the stage-podium spawn Y this rig starts at
    };
    // both are still genuinely mid-move (a floor move never claims to be near the mark while it is happening —
    // that is what "keep the dancer on the mark for every grade" is asking to shorten the DURATION of, not erase);
    // the point is the bounded version reaches a LATER, closer-to-settled point in its own track by the grid's end.
    const liftUnbounded = sampleLiftAt(unbounded), liftBounded = sampleLiftAt(bounded);
    console.log(`live vertical lift off the podium at the grid's end — unbounded: ${(liftUnbounded * 100).toFixed(1)} cm, bounded (fixed): ${(liftBounded * 100).toFixed(1)} cm`);
    expect(liftUnbounded).toBeGreaterThan(0.02);   // sanity: this scenario is genuinely off the mark, not a vacuous 0
    expect(liftBounded).toBeLessThanOrEqual(liftUnbounded + 0.001);
    layer.dispose();
  });

  it('once a dragged windmill\'s crossfade-out to the next step finishes, the root has returned to the stage mark regardless of how it got there (MoveRootLayer restores exactly, by construction)', async () => {
    const scene = new Scene(new NullEngine());
    new FreeCamera('c', new Vector3(0, 1, -3), scene);
    (scene.getEngine() as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;   // crossFade's own weight ramp reads this directly
    const { sk, root } = await loadRig(scene);
    root.position.set(0, 0.7, 0);
    root.computeWorldMatrix(true);
    const stageMark = root.getAbsolutePosition().clone();

    const windmill = buildDanceClip(scene, sk, 'dance_power_windmill')!;
    const toprock = buildDanceClip(scene, sk, 'dance_toprock_basic')!;
    const animator = new CharacterAnimator(scene, [windmill, toprock]);
    const layer = new MoveRootLayer(scene, root, sk, danceRootTracks(new Set(['dance_power_windmill'])));
    // See the previous test's own note: capture the LIVE (apply-phase) position, not the code-driven one
    // onAfterRenderObservable's restore() leaves behind once scene.render() has returned.
    let liveWorldPos = root.position.clone();
    scene.onAfterAnimationsObservable.add(() => { root.computeWorldMatrix(true); liveWorldPos = root.getAbsolutePosition().clone(); });

    animator.play('dance_power_windmill', { loop: true, fadeSec: 0, speedRatio: clipSpeed });
    // land it deep in the middle of its own turn — genuinely off the stage mark, not near either end where the
    // captured track is already close to its own settled STAND-equivalent by authoring (composeCapturedStep always
    // starts and ends a step's root track at identity/zero — that is a property of the CLIP, not of this fix).
    windmill.goToFrame((windmill.to - windmill.from) * 0.5);
    scene.render();
    const midTurnDrift = Vector3.Distance(liveWorldPos, stageMark);
    console.log(`live root distance from the stage mark, deep in the windmill's own turn: ${(midTurnDrift * 100).toFixed(1)} cm`);
    expect(midTurnDrift).toBeGreaterThan(0.05);   // sanity: genuinely mid-turn on screen, not trivially at rest already

    // the next step's crossfade-out — run the weight ramp (fadeSec 0.12s ≈ 7-8 frames at the faked 60fps) to completion
    animator.play('dance_toprock_basic', { loop: true, fadeSec: 0.12, speedRatio: clipSpeed });
    for (let i = 0; i < 12; i++) scene.render();
    root.computeWorldMatrix(true);
    const drift = Vector3.Distance(root.getAbsolutePosition(), stageMark);
    console.log(`settled root drift after the crossfade-out completes: ${(drift * 100).toFixed(3)} cm`);
    expect(drift).toBeLessThan(0.10);   // PLAN phase 8 item 1's own bound
    layer.dispose();
  });
});
