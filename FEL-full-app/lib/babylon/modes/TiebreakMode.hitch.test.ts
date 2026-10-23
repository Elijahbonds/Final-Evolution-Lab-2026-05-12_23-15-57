// S1 HITCH-KILLER (ALL-MODES-TO-75 §1 + §2 Tennis perf, 2026-10-22): Tiebreak builds and compiles everything it will draw BEFORE
// the intro ends. The REAL TiebreakMode on a NullEngine (the cast-fairness rig: tests/helpers/tiebreakRally's stand-in bodies, the
// venue, sound, haptics and effects stubbed), each stand-in carrying a real forehand AnimationGroup so the mirrored backhand is a
// real clone. The script plays a match the way a person does (it reads the ring and the ball's side) with a render every frame.
//
//   TN-5   0 first-use shader compiles after the intro (hitchProbe's createEffect counter on the scene's own engine)
//   mirror the mirrored backhand is cloned once per body at load, and 0 times after it — however many swings meet the other side
//
// A DevTools / Spector capture on the Mini (TN-1, TN-2: worst frame, p5 fps) is a device run; this is the headless counter only.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core/CharacterLibrary', async () => {
  const { standInLibrary } = await import('@/tests/helpers/tiebreakRally');
  const { AnimationGroup, Animation, Quaternion } = await import('@babylonjs/core');
  const lib = (await standInLibrary()).CharacterLibrary;
  return {
    CharacterLibrary: {
      // the stand-in body plus a real 'tennis_swing' group on its right arm: the forehand the mirrored backhand is cloned from
      async spawn(...a: Parameters<typeof lib.spawn>) {
        const body = await lib.spawn(...a);
        const scene = a[0];
        const arm = scene.getTransformNodeByName(`RightArm_${body.id.replace('standin_', '')}`)!;
        arm.rotationQuaternion = Quaternion.Identity();
        const g = new AnimationGroup('tennis_swing', scene);
        const anim = new Animation('swing_rot', 'rotationQuaternion', 30, Animation.ANIMATIONTYPE_QUATERNION);
        anim.setKeys([{ frame: 0, value: Quaternion.Identity() }, { frame: 15, value: Quaternion.RotationYawPitchRoll(0.6, 0, 0) }]);
        g.addTargetedAnimation(anim, arm);
        const groups = (body.animator as unknown as { groups: Map<string, unknown> }).groups;
        groups.set('tennis_swing', g);
        return body;
      },
    },
  };
});
vi.mock('../core/NexusVenue', () => ({ mountVenue: () => null }));
vi.mock('../nexus/placeLooks', () => ({ readPlaceLook: () => null }));
vi.mock('../anim/importSanitizer', async (orig) => ({ ...(await orig<typeof import('../anim/importSanitizer')>()), neverBindPose: () => undefined }));
vi.mock('../anim/clipRegistry', async (orig) => ({ ...(await orig<typeof import('../anim/clipRegistry')>()), installSafePlay: () => undefined }));
vi.mock('../anim/beatOwner', () => ({ BeatOwner: class { loop(): void {} beat(): void {} } }));
vi.mock('../audio/SoundKit', () => ({ SoundKit: { play: () => undefined, unlock: () => undefined, startAmbient: () => undefined, stopAmbient: () => undefined } }));
vi.mock('../premium/Haptics', () => ({ HAPTIC: { tap: () => undefined }, padRumble: () => undefined }));
// the trail and the sparks are particle systems on a DynamicTexture (a DOM canvas): stubbed here, warmed in the mode by isReady()
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { ballTrail: () => ({ dispose: () => undefined, isReady: () => true }), burst: () => undefined }, applyTrail: () => undefined }));
vi.mock('../visual/meshyProps', () => ({ dressBall: async () => false, spawnMeshyProp: async () => null }));
vi.mock('@/lib/a11y/reducedMotion', async (orig) => ({
  ...(await orig<typeof import('@/lib/a11y/reducedMotion')>()),
  motionPolicy: () => ({ reduced: false, flash: true, travel: true, shake: true, hitStop: true }),
}));

import { AnimationGroup, FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import type { ModeContext } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { hitchCounts, markIntroDone, watchCompiles } from '../core/hitchProbe';
import { makeTiebreakMode } from './TiebreakMode';
import { NORMAL_FEEL } from '../core/TiebreakBlitz';

let engine: NullEngine | null = null;
afterEach(() => { engine?.dispose(); engine = null; vi.restoreAllMocks(); });

/** One match: load, the intro's frames, then play to the end (or `maxSec`), a render every frame. */
async function match(o: { aiNets: (rally: number) => boolean; maxSec?: number }) {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);   // the mode seeds its rng from the clock
  engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  scene.metadata = { felModeId: 'tiebreak', felTier: 'low' };
  const camera = new FreeCamera('play_cam', new Vector3(0, 4, 16), scene);
  watchCompiles(scene);
  const clone = vi.spyOn(AnimationGroup.prototype, 'clone');
  const { CameraDirector } = await import('../core/CameraDirector');
  const { GroundLock } = await import('../anim/importSanitizer');
  const camDirector = new CameraDirector(scene, camera, 'court');
  const groundLock = new GroundLock(scene);
  let ended = false;
  const ctx = {
    scene, camera, camDirector, groundLock,
    setHud: () => undefined, end: () => { ended = true; },
    heroRef: { current: null }, objectiveRef: { current: null },
    lights: { tier: 'low', rest: { exposure: 1, vignette: 0 } },
    feel: { impact: () => undefined, speedVignette01: () => undefined },
    momentum: { report: () => undefined },
    juice: { flash: () => undefined, hitStop: () => undefined, shake: () => undefined },
  } as unknown as ModeContext;
  const mode = makeTiebreakMode({ reactBase: 0.5, feel: NORMAL_FEEL, aiNets: (r) => o.aiNets(r), warmup: 1 });
  await mode.load(ctx);
  const clonesAtLoad = clone.mock.calls.length;
  for (let i = 0; i < 6; i++) scene.render();   // the ready card and the intro: what is drawn here compiles behind it
  const compilesBeforePlay = hitchCounts(scene).compiles;
  markIntroDone(scene);
  const ring = scene.getMeshByName('tb_window_neon')!;
  const ball = scene.getMeshByName('tb_ball')!;
  let wasLive = false, openFor = 0, acted = false, swings = 0;
  const sides = new Set<string>();
  const dt = 1 / 60;
  for (let f = 0; f < Math.round((o.maxSec ?? 240) / dt) && !ended; f++) {
    mode.update(ctx, dt);
    scene.render();
    const live = ring.isVisible;
    if (live && !wasLive) { acted = false; openFor = 0; }
    wasLive = live;
    if (live && !acted && ring.visibility === 1 && ++openFor === 3) {
      const dir = ball.position.x < 0 ? 'left' : 'right';
      mode.onInput?.(ctx, { t: 'dpad', dir, pressed: true } as FelInput);
      acted = true; swings++; sides.add(dir);
    }
  }
  scene.render();   // the end card's frame (the trophy, on a win)
  const out = { ended, swings, sides, clonesAtLoad, clonesAfterLoad: clone.mock.calls.length - clonesAtLoad, compilesBeforePlay, counts: hitchCounts(scene) };
  mode.dispose?.(); groundLock.dispose();
  return out;
}

describe('S1 HITCH: Tiebreak builds and compiles everything before the intro ends', () => {
  it('a WON match: 0 first-use compiles after the intro (TN-5), the trophy included; 0 clones after load', async () => {
    const m = await match({ aiNets: () => true });   // the AI nets every return: the player wins 7-0
    console.log(`[S1-HITCH] tiebreak won: swings ${m.swings} sides ${[...m.sides]} · clones at load ${m.clonesAtLoad}, after ${m.clonesAfterLoad} · compiles before play ${m.compilesBeforePlay}, after the intro ${m.counts.afterIntro.compiles}`);
    expect(m.ended).toBe(true);
    expect(m.swings).toBeGreaterThan(5);
    expect(m.compilesBeforePlay).toBeGreaterThan(0);          // the probe sees compiles at all (a control, not a vacuous 0)
    expect(m.counts.afterIntro.compiles).toBe(0);
    expect(m.clonesAfterLoad).toBe(0);
  });

  it('a long rally on both sides: the mirrored backhand is cloned once per body at load and 0 times after (cached per skeleton)', async () => {
    const m = await match({ aiNets: (rally) => rally >= 12 });   // rallies of a dozen returns: forehands and backhands both ways
    console.log(`[S1-HITCH] tiebreak rally: swings ${m.swings} sides ${[...m.sides]} · clones at load ${m.clonesAtLoad}, after ${m.clonesAfterLoad} · counted ${m.counts.clones} (after the intro ${m.counts.afterIntro.clones}) · compiles after the intro ${m.counts.afterIntro.compiles}`);
    expect(m.sides.size).toBe(2);
    expect(m.swings).toBeGreaterThan(20);
    expect(m.clonesAtLoad).toBe(2);                           // the player's and the rival's, at load
    expect(m.clonesAfterLoad).toBe(0);
    expect(m.counts.clones).toBe(2);
    expect(m.counts.afterIntro.clones).toBe(0);
    expect(m.counts.afterIntro.compiles).toBe(0);
  });
});
