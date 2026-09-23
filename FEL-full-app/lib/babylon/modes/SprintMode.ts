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
import { readPlaceLook } from '../nexus/placeLooks';
import { MOOD_TO_FAMILY } from '../visual/Backdrops';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // racing pass phase 3: every press answered
import { makeSprintRace, SPRINT_TUNING } from '../../feel/cores/sprint-skin';
import type { SprintCore } from '../../feel/cores/sprint-core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { locoPick } from '../anim/LocoBus';   // SHARED-ANIM-BUS: one loco pick + stride rate for every on-foot body
import { stepFinishGrace } from '../racing/RaceField';   // MECHANICS PASS: the race ends for everyone

const RACE_DIST = SPRINT_TUNING.raceDistanceM;   // core-owned (100m)
const WIN_TIME = 13.0;                            //TUNE(elijah) sub-13 is the bar
/** Rival pace, m/s — a credible club sprinter to race against. */
const RIVAL_SPEED = RACE_DIST / 13.4;             //TUNE(elijah)

/**
 * Built as a factory so every harness instance closes over its OWN state.
 *
 * This mode previously kept runner/rival/finishLine/core at module scope with a
 * load/dispose counter guarding teardown. That guard was not reliable: React
 * mounts effects twice in dev, and depending on which async load resolved first,
 * an outgoing instance could still null the objects out from under the live one.
 * update() then early-returned forever — the harness reported "playing", the HUD
 * kept rendering, and the canvas stayed black with update() never once called.
 *
 * A ModeDefinition is a module singleton, so closure state is the only way to
 * make that structurally impossible. AirSessionMode is built the same way.
 */
export function makeSprintMode(): ModeDefinition {
let runner: SpawnedCharacter | null = null;
let rival: SpawnedCharacter | null = null;
let finishLine: Mesh | null = null;
let core: SprintCore | null = null;

const S = {
  done: false,
  stumbles: 0,
  rivalDist: 0,
  /** Seconds left to the tape once the rival has breasted it; null = not running. */
  graceLeft: null as number | null,
  banner: '',
  bannerT: 0,
  lastSide: null as 'L' | 'R' | null,
  /** Triggers held (a squeeze is answered once, not every frame the bus re-emits it). */
  trigL: false, trigR: false,
  /** Clean alternating strides in a row (the rhythm streak). */
  streak: 0,
  lookX: 0, lookY: 0,   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
};

const reset = (): void => {
  S.done = false; S.stumbles = 0; S.rivalDist = 0; S.graceLeft = null;
  S.banner = ''; S.bannerT = 0; S.lastSide = null; S.streak = 0; S.trigL = false; S.trigR = false;
  finishLatch = false;
};

const say = (t: string, sec = 0.9): void => { S.banner = t; S.bannerT = sec; };

// A+ P0 juice (PM brief CARNIVAL-A-PLUS-P0, 2026-09-07): a false start / stumble is light feel only; the finish is one latched
// punch — hit-stop + shake + gold flash on a win, a soft shake on a loss. Pad verbs stay inert; no slowMo.
let finishLatch = false;
function finishBeat(ctx: ModeContext, won: boolean): void {
  if (finishLatch) return; finishLatch = true;
  if (won) { ctx.juice.hitStop(55); ctx.juice.shake(0.12, 150); ctx.juice.flash('#FFD700', 130); console.info('[SPRINT-JUICE] finish punch (win)'); }
  else { ctx.juice.shake(0.06, 120); console.info('[SPRINT-JUICE] finish soft (loss)'); }
}

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

/** A 100 m race is short: the tape waits a few seconds, not a kart race's fifteen. */
const RIVAL_GRACE_SEC = 5;

function finish(ctx: ModeContext, timeS: number): void {
  if (S.done) return;
  S.done = true;
  const won = timeS <= WIN_TIME && S.rivalDist < RACE_DIST;
  finishBeat(ctx, won);
  ctx.end(won ? 'win' : 'complete', Math.max(0, Math.round((20 - timeS) * 120) - S.stumbles * 40), {
    timeS: Number(timeS.toFixed(2)), stumbles: S.stumbles, topSpeed: core?.state.topSpeed ?? 0,
  });
}

return {
  modeId: 'sprint',
  // PLACE LOOKS (2026-09-18): the light and the sky are the place's — getters, because the harness reads both at mount
  get mood() { return readPlaceLook('sprint')?.world?.mood ?? 'daylight'; },
  get backdrop() { return readPlaceLook('sprint')?.world?.backdrop ?? MOOD_TO_FAMILY[readPlaceLook('sprint')?.world?.mood ?? 'daylight']; },
  camPreset: 'runner',

  async load(ctx: ModeContext): Promise<void> {
    reset();

    VenueKit.buildTrack(ctx.scene, RACE_DIST, readPlaceLook('sprint')?.world?.colors ?? {});   // SHARED-PLACE-FLOOR: a tartan straight, not the grey park slab; PLACE: the splash's pick recolours it

    // Lane markings down the straight so speed reads as motion rather than a
    // number changing in the corner.
    for (let m = 10; m < RACE_DIST; m += 10) {
      const tick = MeshBuilder.CreateBox(`lane_${m}`, { width: 3.2, height: 0.02, depth: 0.12 }, ctx.scene);
      tick.position.set(0, 0.011, -m);
      tick.material = VenueKit.paint(ctx.scene, `laneMat_${m}`, '#f4f1de', 0.1);   // PBR: a StandardMaterial tick clipped to white
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
    if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }   // MODE-STICK-FACE: R stick → the director's look orbit
    if (S.done || !core) return;
    // RACING PASS phase 3: the face buttons, the shoulders, the clicks and the triggers answered NOTHING — 13 % of the
    // masher's presses were silent, the only silent presses in the racing suite. The race is the d-pad; every other press
    // now says so (a trigger once per squeeze — the bus re-emits a held trigger every frame).
    if (e.t === 'button' && e.pressed) { refuse(ctx, 'THE D-PAD RUNS — ALTERNATE ← →'); return; }
    if (e.t === 'trigger') {
      const side = e.side === 'L' ? 'trigL' : 'trigR';
      const down = e.value >= 0.5;
      if (down && !S[side]) refuse(ctx, 'THE D-PAD RUNS — ALTERNATE ← →');
      S[side] = down; return;
    }
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
      ctx.feel.impact(0.2);   // A+ P0: light feel only (was 0.5)
      S.lastSide = null; S.streak = 0;
      return;
    }
    // A same-side tap is a stumble in the core; surface it so the rhythm is
    // learnable rather than mysterious.
    if (side === S.lastSide && core.state.speed < beforeSpeed) {
      S.stumbles += 1; S.streak = 0;
      say('STUMBLE', 0.7);
      ctx.feel.impact(0.15);   // A+ P0: light feel only
    } else if (S.lastSide !== null && side !== S.lastSide) {
      // SCORECARD FEEL (2026-09-15): a clean stride was answered only by a HUD number and the run cycle speeding up — 15 %
      // of presses had anything you could hear. Every clean stride is a spike on the track now, brighter as the speed
      // builds, and every tenth in a row is a beat of its own.
      const speed01 = Math.min(1, core.state.speed / 11);
      SoundKit.play('uiTick', { pitch: 0.8 + speed01 * 0.9, volume: 0.22 + speed01 * 0.18 });
      S.streak += 1;
      if (S.streak % 10 === 0) { ctx.juice.callout(`RHYTHM ×${S.streak}`, '#fde047', 600); ctx.juice.shake(0.03, 90); }
    }
    S.lastSide = side;
  },

  update(ctx: ModeContext, dt: number): void {
    if (S.done || !core || !runner || !rival || !finishLine) return;

    core.tick(dt * 1000);
    const st = core.state;

    runner.root.position.z = -st.distanceM;
    // SHARED-ANIM-BUS (2026-09-14): the loop off the bus, at the stride rate — the run cycle played at one cadence from a
    // jog to a 10 m/s finish, so the feet skated early and paddled late
    const loco = locoPick({ speed: st.speed });
    runner.animator.play(loco.clip, { loop: true });
    runner.animator.setPlaybackScale(loco.clip, loco.rate);

    // The rival only runs once the gun has gone.
    if (st.phase === 'Run' || st.phase === 'Finish') {
      S.rivalDist = Math.min(RACE_DIST, S.rivalDist + RIVAL_SPEED * dt);
      rival.root.position.z = -S.rivalDist;
      const rivalLoco = locoPick({ speed: RIVAL_SPEED });
      rival.animator.play(rivalLoco.clip, { loop: true });
      rival.animator.setPlaybackScale(rivalLoco.clip, rivalLoco.rate);
      // THE RACE ENDS FOR EVERYONE (MECHANICS PASS, 2026-09-15). The sprint only ended on the PLAYER's tape, so a runner
      // who never found the rhythm stood on a straight that could not finish. The rival breasting the tape now starts a
      // short visible clock; when it runs out the race is called and you did not finish.
      const g = stepFinishGrace(S.graceLeft, dt, S.rivalDist >= RACE_DIST, RIVAL_GRACE_SEC);
      S.graceLeft = g.left;
      if (g.started) { SoundKit.play('whistle'); say(`RIVAL WINS — ${RIVAL_GRACE_SEC}s TO THE TAPE`, 1.4); }
      else if (g.tick !== null && g.tick > 0) say(`FINISH IN ${g.tick}`, 0.9);
      if (g.expired) {
        S.done = true; finishBeat(ctx, false); SoundKit.play('miss');
        say('DID NOT FINISH', 2);
        pushHud(ctx);
        ctx.end('dnf', 0, { timeS: Number(st.timeS.toFixed(2)), stumbles: S.stumbles, topSpeed: st.topSpeed, distanceM: Number(st.distanceM.toFixed(1)) });
        return;
      }
    }

    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }

    // Pure follow-cam: objective NULL, exactly as FootballRushMode (the other
    // 'runner'-preset mode) does. Feeding it a target point pushed the camera to
    // y=8.5 trying to frame both, FrameGuard then reported the hero off-screen
    // and fought back with auto-recenters, and the shot ended up on nothing.
    ctx.camDirector.look(S.lookX, S.lookY, dt);
    ctx.camDirector.update(runner.root.position, new Vector3(0, 0, -st.speed), null);
    pushHud(ctx);
  },

  dispose(): void {
    runner?.dispose(); runner = null;
    rival?.dispose(); rival = null;
    finishLine?.dispose(); finishLine = null;
    core = null;
  },
};
}

export const SprintMode: ModeDefinition = makeSprintMode();
