// SprintMode — Babylon 9 face of the shared SprintCore.
//
// Same deal as the air-session family: lib/feel/cores/sprint-core.ts is already
// render-free and owns the whole race (READY→SET→GO gate, real false starts,
// alternating-cadence impulses, same-side stumbles, drag). The 2D surface only
// drew it. So this is a renderer swap and every tuned constant in
// sprint-constants.ts carries over untouched — including raceDistanceM.
//
// The core is fixed-step: tick(dtMs) advances the clock, step(side) feeds a
// stride. Nothing here re-implements any of it.

import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { SoundKit } from '../audio/SoundKit';
import { makeSprintRace, SPRINT_TUNING } from '../../feel/cores/sprint-skin';
import type { SprintCore } from '../../feel/cores/sprint-core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';

const RACE_DIST = SPRINT_TUNING.raceDistanceM;   // core-owned (100m)
const WIN_TIME = 13.0;                            //TUNE(elijah) sub-13 is the bar
/** Rival pace, m/s — a credible club sprinter to race against. */
const RIVAL_SPEED = RACE_DIST / 13.4;             //TUNE(elijah)

let runner: SpawnedCharacter | null = null;
let rival: SpawnedCharacter | null = null;
let finishLine: Mesh | null = null;
let core: SprintCore | null = null;
let loadCount = 0;
let disposeCount = 0;

const S = {
  done: false,
  stumbles: 0,
  rivalDist: 0,
  banner: '',
  bannerT: 0,
  lastSide: null as 'L' | 'R' | null,
};

const reset = (): void => {
  S.done = false; S.stumbles = 0; S.rivalDist = 0;
  S.banner = ''; S.bannerT = 0; S.lastSide = null;
};

const say = (t: string, sec = 0.9): void => { S.banner = t; S.bannerT = sec; };

function pushHud(ctx: ModeContext): void {
  const st = core?.state;
  ctx.setHud({
    phase: st?.phase ?? 'Ready',
    distance: st ? `${st.distanceM.toFixed(1)}m / ${RACE_DIST}m` : `0m / ${RACE_DIST}m`,
    clock: st ? Number(st.timeS.toFixed(2)) : 0,
    speed: st ? Number(st.speed.toFixed(1)) : 0,
    top: st ? Number(st.topSpeed.toFixed(1)) : 0,
    falseStarts: st?.falseStarts ?? 0,
    rival: `${S.rivalDist.toFixed(1)}m`,
    banner: S.banner || null,
    hint: 'Alternate D-PAD ←/→ in rhythm. Do NOT tap before GO.',
  });
}

function finish(ctx: ModeContext, timeS: number): void {
  if (S.done) return;
  S.done = true;
  const won = timeS <= WIN_TIME && S.rivalDist < RACE_DIST;
  ctx.end(won ? 'win' : 'complete', Math.max(0, Math.round((20 - timeS) * 120) - S.stumbles * 40), {
    timeS: Number(timeS.toFixed(2)), stumbles: S.stumbles, topSpeed: core?.state.topSpeed ?? 0,
  });
}

export const SprintMode: ModeDefinition = {
  modeId: 'sprint',
  mood: 'daylight',
  camPreset: 'runner',

  async load(ctx: ModeContext): Promise<void> {
    loadCount += 1;
    reset();

    VenueKit.buildPark(ctx.scene);

    // Lane markings down the straight so speed reads as motion rather than a
    // number changing in the corner.
    for (let m = 10; m < RACE_DIST; m += 10) {
      const tick = MeshBuilder.CreateBox(`lane_${m}`, { width: 3.2, height: 0.02, depth: 0.12 }, ctx.scene);
      tick.position.set(0, 0.011, -m);
      const tm = new StandardMaterial(`laneMat_${m}`, ctx.scene);
      tm.diffuseColor = Color3.FromHexString('#f4f1de');
      tick.material = tm;
    }

    finishLine = MeshBuilder.CreateBox('finish', { width: 4, height: 0.04, depth: 0.35 }, ctx.scene);
    finishLine.position.set(0, 0.02, -RACE_DIST);
    const fm = new StandardMaterial('finishMat', ctx.scene);
    fm.diffuseColor = Color3.FromHexString('#ffd75e');
    fm.emissiveColor = Color3.FromHexString('#3a3320');
    finishLine.material = fm;

    runner = await CharacterLibrary.spawn(ctx.scene, '', {
      position: new Vector3(-0.7, 0, 0), yawRad: Math.PI, startClip: 'idle_stand', modeId: 'sprint',
    });
    rival = await CharacterLibrary.spawn(ctx.scene, '', {
      position: new Vector3(0.9, 0, 0), yawRad: Math.PI, tint: '#8b1e2d',
      startClip: 'idle_stand', modeId: 'sprint-rival',
    });
    for (const c of [runner, rival]) {
      neverBindPose(c.animator, 'idle_stand');
      installSafePlay(c.animator, 'sprint');
      ctx.groundLock.track(c.root, c.skeleton);
    }
    ctx.heroRef.current = runner.root;
    // Deliberately NULL. FrameGuard's auto-recenter calls
    // camDirector.snapTo(hero, objectiveRef), so pointing this at the finish
    // tape 100m away made every recenter re-frame the whole straight: the camera
    // parked at y=8.5, the 'runner' preset's 22-degree pitch cap meant it could
    // not tilt down to the runner, FrameGuard declared the hero off-screen, and
    // it recentred to the same wrong place forever. A follow-cam race has no
    // second subject to frame.
    ctx.objectiveRef.current = null;

    core = makeSprintRace(undefined, {
      onPhase: (phase) => {
        if (phase === 'Set') say('SET', 1.0);
        else if (phase === 'Go') { say('GO!', 0.8); SoundKit.play('whistle'); }
      },
      onFinish: (timeS) => {
        say(`${timeS.toFixed(2)}s`, 2.0);
        SoundKit.play('score');
        finish(ctx, timeS);
      },
    });

    // Objective NULL here too, matching update(). Handing snapTo a target 12m
    // down-track drove the camera to y=8.5, and the 'runner' preset caps pitch
    // at 22 degrees, so it physically could not tilt down far enough to see the
    // runner — FrameGuard reported "hero off-screen" every frame.
    ctx.camDirector.snapTo(runner.root.position, null);
    say('ON YOUR MARKS', 1.2);
    pushHud(ctx);
  },

  onInput(ctx: ModeContext, e: FelInput): void {
    if (S.done || !core) return;
    if (e.t !== 'dpad' || !e.pressed) return;
    if (e.dir !== 'left' && e.dir !== 'right') return;

    const side: 'L' | 'R' = e.dir === 'left' ? 'L' : 'R';
    const beforeFalse = core.state.falseStarts;
    const beforeSpeed = core.state.speed;
    core.step(side);

    if (core.state.falseStarts > beforeFalse) {
      S.stumbles += 1;
      say('FALSE START!', 1.1);
      SoundKit.play('miss');
      ctx.feel.impact(0.5);
      S.lastSide = null;
      return;
    }
    // A same-side tap is a stumble in the core; surface it so the rhythm is
    // learnable rather than mysterious.
    if (side === S.lastSide && core.state.speed < beforeSpeed) {
      S.stumbles += 1;
      say('STUMBLE', 0.7);
    }
    S.lastSide = side;
  },

  update(ctx: ModeContext, dt: number): void {
    if (S.done || !core || !runner || !rival || !finishLine) return;

    core.tick(dt * 1000);
    const st = core.state;

    runner.root.position.z = -st.distanceM;
    runner.animator.play(st.speed > 4 ? 'run' : st.speed > 0.6 ? 'walk' : 'idle_stand', { loop: true });

    // The rival only runs once the gun has gone.
    if (st.phase === 'Run' || st.phase === 'Finish') {
      S.rivalDist = Math.min(RACE_DIST, S.rivalDist + RIVAL_SPEED * dt);
      rival.root.position.z = -S.rivalDist;
      rival.animator.play('run', { loop: true });
    }

    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }

    // Pure follow-cam: objective NULL, exactly as FootballRushMode (the other
    // 'runner'-preset mode) does. Feeding it a target point pushed the camera to
    // y=8.5 trying to frame both, FrameGuard then reported the hero off-screen
    // and fought back with auto-recenters, and the shot ended up on nothing.
    ctx.camDirector.update(runner.root.position, new Vector3(0, 0, -st.speed), null);
    pushHud(ctx);
  },

  dispose(): void {
    disposeCount += 1;
    // Stale dev teardown must not null the live instance (see ThreePointMode).
    if (disposeCount < loadCount) return;
    runner?.dispose(); runner = null;
    rival?.dispose(); rival = null;
    finishLine?.dispose(); finishLine = null;
    core = null;
  },
};
