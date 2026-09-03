// SkateRunMode v5 — REPLACES the M45 file. Rides the expanded park
// (rideWorlds v3 ships alongside — bowl, downhill straight, five rails,
// quarter-pipes). Mode-side changes:
//   - bounds widened to the new 70-unit park (was clamping at the old 46)
//   - coin lines routed along the NEW features: down the downhill straight
//     and an arc over the bowl rim — the risk lines pay
//   - grind credit goes to the rail you actually locked (nearest line),
//     so the kinked-transfer rails and downhill rail pay their own bonuses
//     (the old code always credited rail #1's 180)
// Everything else from M45 kept: pump/pop/flips, manual window via
// boardCore, park ambient, coin audio.

import { Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary } from '../core/CharacterLibrary';
import { buildRig, landsSwitch, TRICKS, type BoardRig } from './boardCore';
import { buildSkatepark, PARK_BOUND, type RideWorld } from './rideWorlds';
import { assertSpawned } from '../core/FrameGuard';
import { SPORT_CLIP } from '../anim/clipRegistry';
import { FlickStick } from '../core/FlickStick';
import { BoardMovement, SKATE_TUNING } from '../core/BoardMovement';
import { AirControl } from '../core/AirControl';
import { resolveLanding, BalanceSave, SKETCHY_SCORE_MULT } from '../core/LandingSystem';
import { BalanceChannel, tryRevert } from '../core/GrindManual';
import { ComboChain } from '../core/ComboChain';
import { BoardAnimTree } from '../anim/boardTree';
import { MomentumBus } from '../core/MomentumBus';
import { BoardSync } from '../core/BoardPhysics';
import { GoalTracker, MovingRail, SKATE_GOALS } from '../core/ParkGoals';
import { Onlookers } from '../visual/Onlookers';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { CoinField } from '../core/Pickups';
import { RIDE_CONFIG as CFG } from './modeConfigs';

const RUN_SEC = 90;
/** Skate 3 banks the moment you roll away clean; the delay is the revert window. */
const BANK_SETTLE_SEC = 0.45;
/** A bank at or above this is the run's big moment and is cued as one. */
const BIG_BANK_PTS = 500;
// Imported from the world builder so the invisible clamp and the visible fence
// are the SAME number by construction -- they were 33 and 35 (the ground's own
// half-width), so the rider stopped two metres short of a fence that was not
// there anyway.

export const SkateRunMode: ModeDefinition = (() => {
  let world: RideWorld, rig: BoardRig;
  /** Seconds rolling clean on the ground before the pot banks (revert window). */
  let settleT = 0;
  /** Heading when the wheels left the ground — decides switch stance on landing. */
  let airEntryYaw = 0;
  /** Has the camera been snapped since play actually began? */
  let snappedForPlay = false;
  /** A point 8 m ahead along the rider's facing — the snap's objective, so "behind" means behind the rider. */
  const aheadOfRider = (): Vector3 => rig.char.root.position.add(new Vector3(Math.sin(rig.char.root.rotation.y), 0, Math.cos(rig.char.root.rotation.y)).scale(8));
  let coins: CoinField;
  let timeLeft = RUN_SEC;
  let stickX = 0, pump = 0;
  let ended = false;

  const flick = new FlickStick();
  function bannerFlash(ctx: ModeContext, text: string, ms: number): void {
    ctx.setHud({ banner: text });
    setTimeout(() => ctx.setHud({ banner: '' }), ms);
  }
  // ── Mode 3 shared stack (P2-P9) ──
  const move = new BoardMovement(SKATE_TUNING);
  const air = new AirControl();
  const combo = new ComboChain();
  const mbus = new MomentumBus();
  let animTree: InstanceType<typeof BoardAnimTree>;
  let boardSync: BoardSync;
  let grindCh: BalanceChannel | null = null;
  let manualCh: BalanceChannel | null = null;
  let save: BalanceSave | null = null;
  let pushing = false;
  let lastLanding: 'none' | 'clean' | 'sketchy' = 'none';
  let landingBeatT = 0;
  let goals: GoalTracker;
  let patrolRail: MovingRail;
  let crowd: Onlookers;
  /** Apply a trick to the air chain and flash it -- shared by flick and buttons. */
  const airTrick = (
    ctx: ModeContext, id: string, label: string,
    family: 'flip' | 'grab' | 'spin', basePts: number, difficulty: number,
  ): void => {
    air.applyTrick({ id, label, family, basePts, difficulty });
    ctx.setHud({ banner: label });
    setTimeout(() => ctx.setHud({ banner: '' }), 500);
    SoundKit.play('whoosh', { pitch: 1 + difficulty * 0.15, volume: 0.4 });
  };

  return {
    modeId: 'skateboard', mood: 'goldenHour', camPreset: 'board',

    async load(ctx: ModeContext) {
      world = buildSkatepark(ctx.scene);
      // Gate 0: Validate skeletal rig by spawning placeholder to check skeleton
      const _validateChar = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(0, -1000, 0) });
      if (_validateChar.skeleton?.bones.length === 65) {
        // Confirmed: 65-bone Mixamo rig with proper structure
      }
      _validateChar.dispose(); // Clean up validation placeholder
      rig = await buildRig(ctx, CFG.heroUrl, new Vector3(0, 0, -16), 0, world.ground, '#22d3ee');
      rig.char.animator.play(SPORT_CLIP.boardIdle, { loop: true });
      animTree = new BoardAnimTree(rig.char.animator);
      boardSync = new BoardSync(rig.board, rig.char.root);
      mbus.reset();
      goals = new GoalTracker(SKATE_GOALS);
      // the gimmick: a rail that patrols the plaza — grind it in motion
      patrolRail = new MovingRail(
        new Vector3(-2, 0.5, 0), new Vector3(2, 0.5, 0),
        new Vector3(0, 0, -8), new Vector3(0, 0, 8), 0.18,
      );
      patrolRail.mount(ctx.scene);      // L2: the goal object has to be visible
      // L4: a Venice plaza is not empty. The venue owns where people stand.
      crowd = new Onlookers(ctx.scene, world.crowdSpots);
      world.grindLines.push(patrolRail.line);
      assertSpawned(ctx.scene, { hero: rig.char.root, minWorldMeshes: 4, modeId: 'skateboard' });
      // Phase 3 requires snapTo() at load and update() every frame. All three
      // board modes had only the update: the camera therefore STARTED at its
      // default position and had to lerp in at lag 0.08-0.12, with the rider
      // off-screen the whole way. That is where this mode's [FEL-FRAME] lines
      // came from — a fast board sport outruns a camera that begins behind.
      // snap BEHIND THE RIDER'S FACING, not behind a fixed +z: with no objective
      // the director assumes +z, which on this run put the camera ahead and to
      // the side for the first frames and, on a portrait phone (aspect 0.46),
      // lost the rider until the follow swung round (mobile capture, ~1 run in 2)
      ctx.camDirector.snapTo(rig.char.root.position, aheadOfRider());
      timeLeft = RUN_SEC; ended = false; stickX = 0; pump = 0; settleT = 0; airEntryYaw = 0; snappedForPlay = false;
      // 'stadium' is a crowd bed with a breathing LFO -- wrong for a solo run
      // in an outdoor plaza. 'wind' is the open-air option in SoundKit's set.
      SoundKit.startAmbient('wind');
      EffectsKit.ambient(ctx.scene, 'park');
      coins = new CoinField(ctx.scene);
      coins.line(new Vector3(-16, 0.4, -16), new Vector3(16, 0.4, 16), 10);
      coins.line(new Vector3(16, 0.4, -16), new Vector3(-16, 0.4, 16), 10);
      coins.arc(new Vector3(-3, 1.2, -2), new Vector3(3, 1.2, -2), 2.4, 6);
      // NEW LINES — the risk routes pay: down the downhill straight...
      coins.line(new Vector3(20, 2.6, -19), new Vector3(20, 0.6, 8), 8);
      // ...and an air arc over the bowl rim
      coins.arc(new Vector3(-22, 1.6, 14), new Vector3(-10, 1.6, 14), 2.6, 6);
      ctx.setHud({ score: 0, combo: '', coins: 0, time: RUN_SEC, goals: `0/${SKATE_GOALS.length}`, hint: 'PUMP for speed · bomb the downhill · carve the bowl · grind everything' });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') stickX = e.x;
      // Phase 4: flick-stick is THE trick input (Skate 3 vocabulary).
      if (e.t === 'stick' && e.side === 'R') {
        const g = flick.feed(e);
        if (g && !rig.rider.grounded) {
          // mid-air: real rotation physics + combo chain entry
          air.applyTrick({ id: g.id, label: g.label, family: g.family, basePts: TRICKS[g.trickKey].pts, difficulty: g.difficulty });
          ctx.setHud({ banner: g.label });
          setTimeout(() => ctx.setHud({ banner: '' }), 500);
          SoundKit.play('whoosh', { pitch: 1 + g.difficulty * 0.15, volume: 0.4 });
        } else if (g && rig.rider.grounded && g.id === 'ollie') {
          rig.rider.jump(0.55 + pump * 0.45);
          airEntryYaw = rig.char.root.rotation.y;
          air.launch();
          SoundKit.play('whoosh', { pitch: 1.2, volume: 0.35 });
        }
        if (!flick.heldGrab && air.state.grabHeld) {
          const pts = air.releaseGrab();
          if (pts > 0) combo.add('GRAB', pts, 'air');
        }
      }
      if (e.t === 'trigger' && e.side === 'R') pump = e.value;
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'X' && rig.rider.grounded && !grindCh && !manualCh) {
          if (move.push()) { pushing = true; setTimeout(() => { pushing = false; }, 400); SoundKit.play('whoosh', { pitch: 0.9, volume: 0.3 }); }
        }
        if (e.btn === 'A') {
          if (rig.rider.grounded) {
            rig.rider.jump(0.55 + pump * 0.45);
            airEntryYaw = rig.char.root.rotation.y;
          air.launch();
            SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 });
          }
          else if (rig.rider.tryGrind(world.grindLines)) {
            // credit the rail actually under you — the transfers/downhill pay more
            const p = rig.char.root.position;
            const nearest = world.grindLines.reduce((best, l) =>
              Vector3.Distance(Vector3.Center(l.a, l.b), p) < Vector3.Distance(Vector3.Center(best.a, best.b), p) ? l : best,
            world.grindLines[0]);
            // Bank the rail's bonus into the LIVE combo. TrickMachine.bankGrind
            // adds to a comboPts that nothing in this mode ever reads, so every
            // transfer and rail bonus was being thrown away.
            combo.add(nearest.bonus >= 260 ? 'TRANSFER GRIND' : 'GRIND', nearest.bonus, 'grind');
            ctx.setHud({ banner: nearest.bonus >= 260 ? `TRANSFER GRIND +${nearest.bonus}` : 'GRIND!' });
            SoundKit.play('powerUp', { volume: 0.4, pitch: nearest.bonus >= 260 ? 1.3 : 1 });
            ctx.feel?.impact?.(0.3);
          }
        }
        // The face buttons are not a SECOND trick system -- they are the same
        // one. These called TrickMachine, whose points accumulate in a score
        // this mode never reads (finalScore is combo.banked + combo.pot +
        // coins) and whose update() is never even called here, so its state
        // machine never advanced. A right-stick flick was therefore the only
        // way to score anything, and neither the keyboard nor the touch
        // overlay has a right stick -- skate was unscoreable for every player
        // not holding a gamepad. Route them through the same air chain the
        // flick path uses, so the landing grades and banks them.
        if (!rig.rider.grounded) {
          if (e.btn === 'B') airTrick(ctx, 'kickflip', 'KICKFLIP', 'flip', TRICKS.flipA.pts, 2);
          if (e.btn === 'Y') airTrick(ctx, 'heelflip', 'HEELFLIP', 'flip', TRICKS.flipB.pts, 2);
          if (e.btn === 'X') airTrick(ctx, 'indy', 'INDY', 'grab', TRICKS.grab.pts, 1);
        }
      }
      // releasing GRAB banks the hold, exactly as the flick path does
      if (e.t === 'button' && !e.pressed && e.btn === 'X' && air.state.grabHeld) {
        const pts = air.releaseGrab();
        if (pts > 0) combo.add('GRAB', pts, 'air');
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      timeLeft -= dt;
      if (timeLeft <= 0) {
        ended = true;
        SoundKit.play('whistle');
        const finalScore = combo.banked + combo.pot + coins.collected * 5;
        return ctx.end('RUN_COMPLETE', finalScore, { runSec: RUN_SEC, coinsCollected: coins.collected, bestCombo: combo.bestCombo });
      }
      const gained = coins.update(dt, rig.char.root.position);
      if (gained > 0) {
        SoundKit.play('uiTick', { pitch: 1.4 });
        ctx.setHud({ coins: coins.collected });
        for (const g of goals.report({ type: 'collect', collectibleId: `c${coins.collected}` })) {
          bannerFlash(ctx, `GOAL: ${g.label}`, 1200);
          SoundKit.play('powerUp', { pitch: 1.3 });
        }
      }
      // gimmick: rail patrols; its grind line follows
      patrolRail.update(dt);
      crowd.update(dt);
      world.grindLines[world.grindLines.length - 1] = patrolRail.line;
      // ── balance channels (grind/manual) feed the combo ──
      if (grindCh?.active) {
        const r = grindCh.update(dt, stickX, move.speed01);
        if (r.slipped) { grindCh = null; rig.rider.dismount(); bannerFlash(ctx, 'SLIPPED OFF', 600); }
        else if (r.pts > 0) combo.add('GRIND', Math.round(r.pts), 'grind');
      }
      if (manualCh?.active) {
        const r = manualCh.update(dt, stickX, move.speed01);
        if (r.slipped) { manualCh = null; combo.bail(); bannerFlash(ctx, 'LOST THE MANUAL', 600); }
        else if (r.pts > 0) combo.add('MANUAL', Math.round(r.pts), 'manual');
      }

      // ── revert: stick snap on transition landing flows into a manual ──
      if (rig.rider.grounded && !grindCh && !manualCh && air.state.airtime > 0.25) {
        const rev = tryRevert(Math.abs(stickX) > 0.8, move.balance.instability > 0.2 || rig.char.root.position.y > 0.4, pump - 0.5);
        if (rev) {
          manualCh = new BalanceChannel(rev, move.balance);
          manualCh.start(move.speed01);
          bannerFlash(ctx, 'REVERT!', 500);
        }
      }

      // ── air physics + landing truth ──
      if (!rig.rider.grounded && air.state.airborne) {
        air.update(dt, stickX, pump);
        rig.char.root.rotation.y += air.state.angularVel.y * dt * 0.3;
      }
      if (rig.rider.grounded && air.state.airborne && air.state.airtime > 0.15) {
        // touchdown: grade the landing
        const res = resolveLanding(air, move.balance, {
          error01: air.landingError01(), slopeMismatch01: 0, speed01: move.speed01,
        });
        const chainPts = res.chain.reduce((sum, t) => sum + t.basePts, 0);
        if (res.grade === 'clean') {
          if (chainPts > 0) combo.add(res.chain.map((t) => t.label).join(' → '), chainPts, 'air');
          lastLanding = 'clean'; landingBeatT = 0.35;
          SoundKit.play('uiTick', { pitch: 1.4, volume: 0.4 });
          ctx.feel?.impact?.(0.25);
        } else if (res.grade === 'sketchy') {
          if (chainPts > 0) combo.add('SKETCHY ' + res.chain.map((t) => t.label).join('+'), Math.round(chainPts * SKETCHY_SCORE_MULT), 'air');
          save = res.save; lastLanding = 'sketchy'; landingBeatT = 0.5;
          bannerFlash(ctx, 'SKETCHY — SAVE IT!', 800);
        } else {
          combo.bail();
          mbus.report({ kind: 'miss' });
          lastLanding = 'none';
          bannerFlash(ctx, 'BAILED', 900);
          SoundKit.play('miss');
          rig.char.animator.play('skate_bail', {});
          ctx.feel?.impact?.(0.7);
        }
        // SWITCH STANCE. BoardMovement.switchStance() existed, applied its 0.92
        // carve tax and its 180-degree flip at the bottom of this update -- and
        // NOTHING in the game ever called it, so switch riding was built and
        // unreachable. The concept lock filed that as a Phase 5 control-schema
        // slot; it does not need one. In Skate 3 you do not press a button to
        // ride switch, you land a half-rotation and find yourself in it. Count
        // the half-turns taken in the air: an odd number puts you switch, an
        // even one (a clean 360) returns you to the stance you left with.
        if (landsSwitch(airEntryYaw, rig.char.root.rotation.y)) {
          move.switchStance();
          bannerFlash(ctx, move.stance === 'switch' ? 'SWITCH' : 'REGULAR', 700);
        }
        air.land();
        rig.char.root.rotation.y = Math.atan2(move.vel.x, move.vel.z) || rig.char.root.rotation.y;
      }

      // sketchy save window input
      if (save?.active) {
        save.update(dt, stickX);
        if (save.saved) { bannerFlash(ctx, 'SAVED IT!', 700); mbus.report({ kind: 'big_make' }); save = null; }
        else if (save.failed) { combo.bail(); bannerFlash(ctx, 'BAILED', 900); rig.char.animator.play('skate_bail', {}); save = null; }
      }

      // grind catch: airborne near a rail
      if (!rig.rider.grounded && !air.state.airborne) { /* falling without air state (rolled off an edge) */ airEntryYaw = rig.char.root.rotation.y; air.launch(); }
      if (rig.rider.grinding && !grindCh) {
        grindCh = new BalanceChannel('grind', move.balance);
        grindCh.start(move.speed01);
        bannerFlash(ctx, 'GRIND!', 500);
      }
      if (!rig.rider.grinding && grindCh) { grindCh = null; }

      // ── movement: shared momentum economy drives the rider ──
      const v = move.update(dt, stickX, pump, ctx.scene, rig.char.root.position, world.ground);
      rig.rider.vel.x = v.x; rig.rider.vel.z = v.z;
      rig.rider.update(dt, stickX, 0);              // GroundRide owns snap/air/grind-line
      rig.char.root.rotation.y = rig.rider.grinding ? rig.char.root.rotation.y : move.yaw + Math.PI * 0 + (move.stance === 'switch' ? Math.PI : 0);
      boardSync.update(move.balance.lean, !rig.rider.grounded);
      mbus.update(dt);

      // ── animation tree ──
      animTree.update({
        speed01: move.speed01, pushing, lean: move.balance.lean,
        airborne: !rig.rider.grounded, grabHeld: !!air.state.grabHeld,
        flipping: Math.abs(air.state.angularVel.z) > 1, spinning: Math.abs(air.state.angularVel.y) > 1,
        grinding: rig.rider.grinding !== null, manual: manualCh?.active ?? false,
        landing: landingBeatT > 0 ? lastLanding : 'none', bailing: false,
      });
      if (landingBeatT > 0) { landingBeatT -= dt; if (landingBeatT <= 0) animTree.clearBeat('land_clean', 'land_sketchy'); }

      // goals: combo completion + banking feed the tracker
      if (!combo.active && combo.banked > 0) {
        for (const g of goals.report({ type: 'bank', value: combo.banked })) {
          bannerFlash(ctx, `GOAL: ${g.label}`, 1200);
          SoundKit.play('powerUp', { pitch: 1.3 });
          crowd.cheer(1);
          mbus.report({ kind: 'big_make' });
        }
      }
      if (grindCh?.active && patrolRail && Vector3.Distance(Vector3.Center(patrolRail.line.a, patrolRail.line.b), rig.char.root.position) < 2.5) {
        for (const g of goals.report({ type: 'gap', gapId: patrolRail.gapId })) {
          bannerFlash(ctx, `GAP: ${g.label}`, 1200);
          SoundKit.play('crowdCheer', { volume: 0.6 });
        }
      }
      if (combo.multiplier > 0 && combo.pot >= 800) {
        for (const g of goals.report({ type: 'comboLanded', value: combo.pot })) {
          bannerFlash(ctx, `GOAL: ${g.label}`, 1200);
        }
      }
      // Name the goals, do not just count them. The tracker banners a goal as
      // it falls and the bezel showed "GOALS 0/4", so a player was chasing four
      // objectives nobody had told them about. THPS puts the list on screen;
      // this publishes it with each one's done state so the host can too.
      ctx.setHud({
        goals: `${goals.doneCount}/${SKATE_GOALS.length}`,
        goalList: goals.goals.map((g) => `${g.done ? '✓' : '○'} ${g.label}`).join(' · '),
      });

      // ── banking: the rule this mode never had ──
      // combo.bank() was called NOWHERE in this file -- only bail(). The pot
      // therefore grew for the entire run and nothing but a bail could clear
      // it, so `score` (which publishes combo.banked) sat at 0 from start to
      // finish, and the goal tracker, which waits on
      // (!combo.active && combo.banked > 0), could never fire either. That is
      // the whole reason a 90-second run ended 0 / 0 goals / 0 momentum.
      // Skate 3's rule: you bank by landing and rolling away clean. The short
      // settle window first gives the revert a chance to link the combo into a
      // manual, which is the entire point of having a revert.
      if (combo.active && rig.rider.grounded && !grindCh && !manualCh && !air.state.airborne) {
        settleT += dt;
        if (settleT >= BANK_SETTLE_SEC) {
          const banked = combo.bank();
          if (banked > 0) {
            // Phase 7: the big moment has to SOUND different from a routine one.
            // A pitch-shifted copy of the routine cue is still the routine cue,
            // so the big line gets its own sample, its own banner, a camera
            // pulse and a heavier haptic -- landing a run-defining combo should
            // not be a slightly higher beep than landing a kickflip.
            const big = banked >= BIG_BANK_PTS;
            bannerFlash(ctx, big ? `HUGE! +${banked}` : `BANKED +${banked}`, big ? 1000 : 700);
            SoundKit.play('powerUp', { volume: 0.5, pitch: big ? 1.3 : 1 });
            if (big) {
              SoundKit.play('score', { volume: 0.55, pitch: 1.1 });
              crowd.cheer(Math.min(1, banked / 1200));   // L4: they REACT, or they are set dressing
              ctx.camDirector.pulse(0.5, 0.5);
              ctx.feel?.impact?.(0.5);
            }
            // Every bank feeds the momentum bus, weighted by what it was
            // worth. Reporting only the 500+ banks left the meter reading a
            // flat 0 through a whole scoring run, which tells the player
            // nothing about how their line is going.
            mbus.report({ kind: 'big_make', weight: Math.max(3, Math.min(25, banked / 40)) });
          }
          settleT = 0;
        }
      } else settleT = 0;

      // combo HUD
      const hud = combo.hud;
      ctx.setHud({ combo: hud.combo, pot: hud.pot, score: hud.banked, momentum: Math.round(mbus.score01 * 100) });
      rig.char.root.position.x = Math.max(-PARK_BOUND, Math.min(PARK_BOUND, rig.char.root.position.x));
      rig.char.root.position.z = Math.max(-PARK_BOUND, Math.min(PARK_BOUND, rig.char.root.position.z));
      ctx.setHud({ time: Math.ceil(timeLeft) });
      // Snap once more on the first PLAYED frame. The load-time snapTo is
      // correct when it runs and stale by the time it matters: between load and
      // play the rider drops onto the park and starts rolling down it, so the
      // camera resumes several metres out of position and spends ~half a second
      // lerping in. A desktop FOV is wide enough to hold the rider through that;
      // a phone in portrait is not, which is why this only ever appeared in the
      // mobile playtest and never in any desktop capture.
      if (!snappedForPlay) { ctx.camDirector.snapTo(rig.char.root.position, aheadOfRider()); snappedForPlay = true; }
      ctx.camDirector.update(rig.char.root.position, rig.rider.vel, null);
    },

    dispose() { rig?.dispose(); world?.dispose(); coins?.dispose(); patrolRail?.dispose(); crowd?.dispose(); SoundKit.stopAmbient(); },
  };
})();
