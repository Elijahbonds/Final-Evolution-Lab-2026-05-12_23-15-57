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
import { buildRig, TrickMachine, TRICKS, type BoardRig } from './boardCore';
import { buildSkatepark, type RideWorld } from './rideWorlds';
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
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { CoinField } from '../core/Pickups';
import { RIDE_CONFIG as CFG } from './modeConfigs';

const RUN_SEC = 90;
const PARK_BOUND = 33;

export const SkateRunMode: ModeDefinition = (() => {
  let world: RideWorld, rig: BoardRig, tricks: TrickMachine;
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
  return {
    modeId: 'skateboard', mood: 'goldenHour', camPreset: 'board',

    async load(ctx: ModeContext) {
      world = buildSkatepark(ctx.scene);
      rig = await buildRig(ctx, CFG.heroUrl, new Vector3(0, 0, -16), 0, world.ground, '#22d3ee');
      rig.char.animator.play(SPORT_CLIP.boardIdle, { loop: true });
      tricks = new TrickMachine(rig, (h) => ctx.setHud(h));
      animTree = new BoardAnimTree(rig.char.animator);
      boardSync = new BoardSync(rig.board, rig.char.root);
      mbus.reset();
      assertSpawned(ctx.scene, { hero: rig.char.root, minWorldMeshes: 4, modeId: 'skateboard' });
      timeLeft = RUN_SEC; ended = false; stickX = 0; pump = 0;
      SoundKit.startAmbient('stadium');
      EffectsKit.ambient(ctx.scene, 'park');
      coins = new CoinField(ctx.scene);
      coins.line(new Vector3(-16, 0.4, -16), new Vector3(16, 0.4, 16), 10);
      coins.line(new Vector3(16, 0.4, -16), new Vector3(-16, 0.4, 16), 10);
      coins.arc(new Vector3(-3, 1.2, -2), new Vector3(3, 1.2, -2), 2.4, 6);
      // NEW LINES — the risk routes pay: down the downhill straight...
      coins.line(new Vector3(20, 2.6, -19), new Vector3(20, 0.6, 8), 8);
      // ...and an air arc over the bowl rim
      coins.arc(new Vector3(-22, 1.6, 14), new Vector3(-10, 1.6, 14), 2.6, 6);
      ctx.setHud({ score: 0, combo: '', time: RUN_SEC, hint: 'PUMP for speed · bomb the downhill · carve the bowl · grind everything' });
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
            air.launch();
            SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 });
          }
          else if (rig.rider.tryGrind(world.grindLines)) {
            // credit the rail actually under you — the transfers/downhill pay more
            const p = rig.char.root.position;
            const nearest = world.grindLines.reduce((best, l) =>
              Vector3.Distance(Vector3.Center(l.a, l.b), p) < Vector3.Distance(Vector3.Center(best.a, best.b), p) ? l : best,
            world.grindLines[0]);
            tricks.bankGrind(nearest);
            ctx.setHud({ banner: nearest.bonus >= 260 ? `TRANSFER GRIND +${nearest.bonus}` : 'GRIND!' });
            SoundKit.play('powerUp', { volume: 0.4, pitch: nearest.bonus >= 260 ? 1.3 : 1 });
            ctx.feel?.impact?.(0.3);
          }
        }
        // face buttons kept as accessibility fallbacks (same tricks)
        if (e.btn === 'B') tricks.start(TRICKS.flipA);
        if (e.btn === 'Y') tricks.start(TRICKS.flipB);
        if (e.btn === 'X') tricks.start(TRICKS.grab);
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') tricks.endGrab();
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
      if (gained > 0) { SoundKit.play('uiTick', { pitch: 1.4 }); ctx.setHud({ coins: coins.collected }); }
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
      if (!rig.rider.grounded && !air.state.airborne) { /* falling without air state (rolled off an edge) */ air.launch(); }
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

      // combo HUD
      const hud = combo.hud;
      ctx.setHud({ combo: hud.combo, pot: hud.pot, score: hud.banked, momentum: Math.round(mbus.score01 * 100) });
      rig.char.root.position.x = Math.max(-PARK_BOUND, Math.min(PARK_BOUND, rig.char.root.position.x));
      rig.char.root.position.z = Math.max(-PARK_BOUND, Math.min(PARK_BOUND, rig.char.root.position.z));
      ctx.setHud({ time: Math.ceil(timeLeft) });
      ctx.camDirector.update(rig.char.root.position, rig.rider.vel, null);
    },

    dispose() { rig?.dispose(); world?.dispose(); coins?.dispose(); SoundKit.stopAmbient(); },
  };
})();
