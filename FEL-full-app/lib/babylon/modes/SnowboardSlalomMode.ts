// SnowboardSlalomMode v5 — REPLACES the M44 file. The slope is no longer an
// empty gate corridor (rideWorlds v3 ships alongside):
//   ROCKS — real obstacles on the piste. Hit one grounded and you stumble
//     (speed cut, -50, brief recovery i-frames). JUMP clears them clean.
//   RAILS — three down-slope rails: press JUMP in the air near one to lock
//     a grind (same tryGrind flow Skate Run uses), stick to dismount.
//   THE LIFT GRIND — launch off the second kicker into the ski-lift CABLE
//     for the run's biggest grind bonus (400).
//   THE YETI — an original FEL creature (an oversized, frost-tinted
//     pursuer — no franchise likeness of any kind). It bursts from beside
//     the piste mid-run and chases for a stretch; jump its lunge for
//     +150 ("CLEARED THE YETI"), get caught grounded and you tumble
//     (-100, hard speed cut). One appearance per run, watchdog-bounded.
// Everything from M44 kept: gates, tricks, tuck, gate/miss audio language.

import { Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { buildRig, TrickMachine, TRICKS, type BoardRig } from './boardCore';
import { buildSlopeRun, PISTE_HALF_WIDTH, type RideWorld } from './rideWorlds';
import { Mob, MobPool, STEERING_PRESETS } from '../core/MobSteering';
import { CharacterLibrary } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { BoardMovement, SNOW_TUNING } from '../core/BoardMovement';
import { MomentumBus } from '../core/MomentumBus';
import { assertSpawned } from '../core/FrameGuard';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { RIDE_CONFIG as CFG } from './modeConfigs';

const YETI_SPAWN_GATE = 5;                 // bursts out after this gate clears
const YETI_CHASE_SEC = 8;
const YETI_CLEAR_PTS = 150;
const YETI_CATCH_PENALTY = 100;
const ROCK_PENALTY = 50;
const STUMBLE_IFRAME_SEC = 1.2;
/** Tuck depth at which the rider commits and starts SPENDING the boost meter. */
export const BOOST_TUCK = 0.85;
/** Boost burned per second while boosting. */
export const BOOST_DRAIN = 30;
/** Boost gained per spin landed. */
export const BOOST_PER_SPIN = 12;
/** Ceiling on the boost meter. */
export const BOOST_MAX = 100;

export const SnowboardSlalomMode: ModeDefinition = (() => {
  let world: RideWorld, rig: BoardRig, tricks: TrickMachine;
  let crowd: Onlookers;
  let nextGate = 0, gatesHit = 0, elapsed = 0;
  let stickX = 0, tuck = 0;
  let ended = false;
  let stumbleIframe = 0;
  let yeti: Mob | null = null, yetiPool: MobPool | null = null;
  let yetiSec = 0, yetiDone = false;
  const move = new BoardMovement(SNOW_TUNING);   // Phase 12: carve weight + slope energy
  const mbus = new MomentumBus();
  let boost = 0;                                  // SSX boost meter 0..100
  let boosting = false;

  async function spawnYeti(ctx: ModeContext): Promise<void> {
    if (yetiDone || yeti) return;
    yetiDone = true;                       // one appearance per run, no matter what
    const p = rig.char.root.position;
    const char = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
      position: new Vector3(p.x + 12, p.y, p.z + 6),
      scale: 1.4, tint: '#dfe9f2', startClip: SPORT_CLIP.idle,
    });
    neverBindPose(char.animator, SPORT_CLIP.idle);
    installSafePlay(char.animator, 'snowboard-yeti');
    ctx.groundLock?.track(char.root, char.skeleton);
    yeti = new Mob(char, STEERING_PRESETS.rusher);
    yeti.startPursuit();
    yetiPool = new MobPool();
    yetiPool.add(yeti);
    yetiSec = 0;
    SoundKit.play('crowdGroan', { pitch: 0.45, volume: 0.7 });   // the roar
    ctx.feel?.impact?.(0.3);
    ctx.setHud({ banner: 'YETI ON YOUR TAIL!' });
    setTimeout(() => ctx.setHud({ banner: '' }), 1100);
  }

  function despawnYeti(ctx: ModeContext): void {
    if (!yeti) return;
    const gone = yeti;
    yeti = null; yetiPool = null;
    gone.down();
    ctx.groundLock?.release(gone.char.root);
    EffectsKit.burst(ctx.scene, gone.char.root.position.add(new Vector3(0, 1, 0)), 'dust');
    const root = gone.char.root;
    const startY = root.position.y;
    const sink = ctx.scene.onBeforeRenderObservable.add(() => {
      root.position.y -= 0.03;
      if (root.position.y < startY - 3) {
        ctx.scene.onBeforeRenderObservable.remove(sink);
        gone.char.dispose();
      }
    });
    setTimeout(() => { try { gone.char.dispose(); } catch { /* already gone */ } }, 2500);
  }

  return {
    modeId: 'snowboard', mood: 'alpine', camPreset: 'descent',

    async load(ctx: ModeContext) {
      world = buildSlopeRun(ctx.scene);
      rig = await buildRig(ctx, CFG.heroUrl, new Vector3(0, 0.2, 4), 0, world.ground, '#ff6b3d');
      tricks = new TrickMachine(rig, (h) => ctx.setHud(h));
      assertSpawned(ctx.scene, { hero: rig.char.root, minWorldMeshes: 20, modeId: 'snowboard' });
      nextGate = 0; gatesHit = 0; elapsed = 0; ended = false; stickX = 0; tuck = 0;
      stumbleIframe = 0; yeti = null; yetiPool = null; yetiSec = 0; yetiDone = false;
      ctx.objectiveRef.current = world.markers[nextGate] ?? null;
      crowd = new Onlookers(ctx.scene, world.crowdSpots, '#2f3f57');   // L4: spectators on the slope
      // Phase 3 requires snapTo() at load and update() every frame. All three
      // board modes had only the update: the camera therefore STARTED at its
      // default position and had to lerp in at lag 0.08-0.12, with the rider
      // off-screen the whole way. That is where this mode's [FEL-FRAME] lines
      // came from — a fast board sport outruns a camera that begins behind.
      ctx.camDirector.snapTo(rig.char.root.position, world.markers[nextGate] ?? null);
      SoundKit.startAmbient('wind');           // Phase 18: descent wind bed
      EffectsKit.ambient(ctx.scene, 'slope');  // snowfall
      ctx.setHud({ score: 0, boost: 0, gates: `0/${world.markers.length}`, hint: 'Gates for points · JUMP rocks · grind the rails · watch the treeline…' });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') stickX = e.x;
      if (e.t === 'trigger' && e.side === 'R') tuck = e.value;
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') {
          if (rig.rider.grounded) {
            rig.rider.jump(0.5 + tuck * 0.5);
            rig.char.animator.play(SPORT_CLIP.boardAir, {});
            SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 });
          } else if (rig.rider.tryGrind(world.grindLines)) {
            // credit the line actually closest to the rider (lift cable pays 400)
            const p = rig.char.root.position;
            const nearest = world.grindLines.reduce((best, l) =>
              Vector3.Distance(Vector3.Center(l.a, l.b), p) < Vector3.Distance(Vector3.Center(best.a, best.b), p) ? l : best,
            world.grindLines[0]);
            tricks.bankGrind(nearest);
            const isCable = nearest.bonus >= 400;
            ctx.setHud({ banner: isCable ? 'LIFT CABLE GRIND!' : 'RAIL GRIND!' });
            SoundKit.play('powerUp', { volume: 0.45, pitch: isCable ? 1.4 : 1 });
            // The lift cable is the run's biggest single score. It already
            // sounded different from an ordinary rail; now it looks different.
            if (isCable) { ctx.camDirector.pulse(0.8, 0.5); ctx.feel?.impact?.(0.4); }
            ctx.feel?.impact?.(isCable ? 0.45 : 0.3);
          }
        }
        if (e.btn === 'B') {
          tricks.start(TRICKS.spin);
          boost = Math.min(BOOST_MAX, boost + BOOST_PER_SPIN);
          ctx.setHud({ boost: Math.round(boost) });   // the meter has to move as it FILLS, not only as it drains
        }
        if (e.btn === 'R1') boosting = boost > 10;
        if (e.btn === 'X') tricks.start(TRICKS.grab);
        if (e.btn === 'Y') tricks.start(TRICKS.flipA);
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') tricks.endGrab();
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      elapsed += dt;
      stumbleIframe = Math.max(0, stumbleIframe - dt);
      if (rig.rider.grinding && Math.abs(stickX) > 0.7) rig.rider.dismount();
      // Phase 12: slope energy via the shared board movement (descent builds
      // speed for real); tuck adds, boost spends the meter on a burst.
      // TUCK, not 0. The comment above says "tuck adds" and the HUD verb is
      // literally TUCK, but the momentum model was handed a hard-coded 0, so
      // tucking drove the animation and nothing else. With pushAccel 0 on snow,
      // that left slope gravity as the ONLY propulsion in the mode: measured
      // over six seconds of held tuck the rider covered 1.5m down the hill
      // against 7.2m across it, roughly 0.75 m/s of descent on a course 205m
      // long. That is the whole reason a 90-second run scored 1 gate out of 12
      // -- the rider only ever physically reached the first one.
      const v = move.update(dt, stickX, tuck, ctx.scene, rig.char.root.position, world.ground);
      rig.rider.vel.x = v.x; rig.rider.vel.z = v.z;
      rig.rider.update(dt, stickX, tuck);
      crowd.update(dt);
      // The rider has to FACE where they are going. This mode never set the
      // root rotation at ALL, so the board kept whatever yaw it spawned with
      // and the rider came down the mountain broadside -- steering with the
      // slalom while permanently pointed across the fall line. The board mesh
      // is parented to this root, so it was sideways too. Skate takes the same
      // yaw from the same shared momentum object; snowboard simply never had
      // the line. Grinding holds its own heading, as it does there.
      if (!rig.rider.grinding) rig.char.root.rotation.y = move.yaw;
      // SSX Tricky is NAMED after its boost state, and this meter could not be
      // spent: `boosting` was never assigned true ANYWHERE in the codebase, so
      // boost filled at +12 a spin and drained inside a branch nothing could
      // enter. Everything else was already here -- the acceleration, the drain,
      // the HUD publish -- only the trigger was missing, which is why it read as
      // a working feature.
      //
      // Same commitment idiom surf uses for its flow meter, deliberately: one
      // benchmark, one economy. Bury the tuck and you spend the meter; ease off
      // and you keep what is left.
      if (!boosting && tuck >= BOOST_TUCK && boost > 1) {
        boosting = true;
        SoundKit.play('powerUp', { pitch: 0.9, volume: 0.5 });
        ctx.setHud({ banner: 'BOOST' });
        setTimeout(() => ctx.setHud({ banner: '' }), 700);
      } else if (boosting && tuck < BOOST_TUCK * 0.6) {
        boosting = false;
      }
      if (boosting) {
        rig.rider.vel.scaleInPlace(1 + 0.9 * dt);
        boost = Math.max(0, boost - BOOST_DRAIN * dt);
        if (boost === 0) boosting = false;
        ctx.setHud({ boost: Math.round(boost) });
      }
      mbus.update(dt);

      // ROCKS — grounded contact is a stumble; airborne clears clean
      if (stumbleIframe === 0 && rig.rider.grounded && !rig.rider.grinding) {
        const p = rig.char.root.position;
        for (const o of world.obstacles) {
          if (Math.hypot(p.x - o.pos.x, p.z - o.pos.z) < o.radius + 0.5 && Math.abs(p.y - o.pos.y) < 1.6) {
            stumbleIframe = STUMBLE_IFRAME_SEC;
            tricks.score = Math.max(0, tricks.score - ROCK_PENALTY);
            rig.rider.vel.scaleInPlace(0.35);
            SoundKit.play('impact', { pitch: 0.8, volume: 0.5 });
            ctx.feel?.impact?.(0.4);
            EffectsKit.burst(ctx.scene, p.clone(), 'dust');
            rig.char.animator.play(SPORT_CLIP.boardBail, { onEnd: () => rig.char.animator.play(SPORT_CLIP.boardIdle, { loop: true }) });
            ctx.setHud({ score: tricks.score, banner: `ROCK! -${ROCK_PENALTY}` });
            setTimeout(() => ctx.setHud({ banner: '' }), 700);
            break;
          }
        }
      }

      // THE YETI — spawn after gate N, chase for a bounded window
      if (!yetiDone && gatesHit >= YETI_SPAWN_GATE) void spawnYeti(ctx);
      if (yeti && yetiPool) {
        yetiSec += dt;
        const contacts = yetiPool.update(dt, rig.char.root.position, rig.rider.vel);
        for (const mob of contacts) {
          if (!rig.rider.grounded || rig.rider.grinding) {
            tricks.score += YETI_CLEAR_PTS;
            mob.onContactResolved();
            SoundKit.play('crowdCheer', { volume: 0.5 });
            ctx.camDirector.pulse(1, 0.55);
            crowd?.cheer(1);
            ctx.feel?.impact?.(0.3);
            ctx.setHud({ score: tricks.score, banner: `CLEARED THE YETI +${YETI_CLEAR_PTS}` });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
            despawnYeti(ctx);
          } else {
            tricks.score = Math.max(0, tricks.score - YETI_CATCH_PENALTY);
            rig.rider.vel.scaleInPlace(0.25);
            mob.onContactResolved();
            SoundKit.play('impact', { pitch: 0.5, volume: 0.7 });
            ctx.feel?.impact?.(0.6);
            EffectsKit.burst(ctx.scene, rig.char.root.position.clone(), 'dust');
            rig.char.animator.play(SPORT_CLIP.boardBail, { onEnd: () => rig.char.animator.play(SPORT_CLIP.boardIdle, { loop: true }) });
            ctx.setHud({ score: tricks.score, banner: `THE YETI GOT YOU -${YETI_CATCH_PENALTY}` });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
            despawnYeti(ctx);
          }
          break;
        }
        if (yeti && yetiSec > YETI_CHASE_SEC) {         // it gives up — watchdog-bounded chase
          ctx.setHud({ banner: 'THE YETI FALLS BEHIND' });
          setTimeout(() => ctx.setHud({ banner: '' }), 800);
          despawnYeti(ctx);
        }
      }

      const gate = world.markers[nextGate];
      if (gate) {
        const p = rig.char.root.position;
        if (p.z >= gate.z - 0.3) {
          if (Math.abs(p.x - gate.x) <= 2.0) {
            gatesHit++;
            tricks.score += 100;
            ctx.feel?.impact?.(0.15);
            SoundKit.play('score', { pitch: 1.4, volume: 0.35 });
            EffectsKit.burst(ctx.scene, rig.char.root.position.clone(), 'sparks');
            ctx.setHud({ banner: 'GATE ✓', score: tricks.score });
            crowd?.cheer(0.5);
          } else {
            SoundKit.play('miss', { volume: 0.3 });
            ctx.setHud({ banner: 'MISSED GATE' });
          }
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
          nextGate++;
          ctx.setHud({ gates: `${gatesHit}/${world.markers.length}` });
        }
      }

      const trickBanner = tricks.update(dt);
      if (trickBanner) {
        ctx.setHud({ banner: trickBanner });
        setTimeout(() => ctx.setHud({ banner: '' }), 900);
      }
      rig.char.animator.play(
        rig.rider.grinding ? SPORT_CLIP.boardGrind
          : rig.rider.grounded ? (tuck > 0.5 ? SPORT_CLIP.boardTuck : SPORT_CLIP.boardIdle) : SPORT_CLIP.boardAir,
        { loop: true });
      // Clamp at the edge of the snow, from the piste's own constant — the same
      // one-number rule skate's fence and surf's water edge now follow, so the
      // edge a player feels is always an edge they can see.
      const edge = PISTE_HALF_WIDTH - 1;
      rig.char.root.position.x = Math.max(-edge, Math.min(edge, rig.char.root.position.x));

      if (nextGate >= world.markers.length) {
        ended = true;
        SoundKit.play('whistle');
        const timeBonus = Math.max(0, Math.round((60 - elapsed) * 10));
        return ctx.end('FINISHED', tricks.score + timeBonus, { gatesHit, elapsed: Math.round(elapsed) });
      }
      ctx.camDirector.update(rig.char.root.position, rig.rider.vel, gate ?? null);
    },

    dispose() {
      yeti?.char.dispose(); yeti = null; yetiPool = null;
      crowd?.dispose();
      rig?.dispose(); world?.dispose(); SoundKit.stopAmbient();
    },
  };
})();
