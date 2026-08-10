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

  return {
    modeId: 'skateboard', mood: 'goldenHour', camPreset: 'board',

    async load(ctx: ModeContext) {
      world = buildSkatepark(ctx.scene);
      rig = await buildRig(ctx, CFG.heroUrl, new Vector3(0, 0, -16), 0, world.ground, '#22d3ee');
      rig.char.animator.play(SPORT_CLIP.boardIdle, { loop: true });
      tricks = new TrickMachine(rig, (h) => ctx.setHud(h));
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
      if (e.t === 'trigger' && e.side === 'R') pump = e.value;
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') {
          if (rig.rider.grounded) { rig.rider.jump(0.55 + pump * 0.45); rig.char.animator.play(SPORT_CLIP.boardAir, {}); SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 }); }
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
        return ctx.end('RUN_COMPLETE', tricks.score + coins.collected * 5, { runSec: RUN_SEC, coinsCollected: coins.collected });
      }
      const gained = coins.update(dt, rig.char.root.position);
      if (gained > 0) { SoundKit.play('uiTick', { pitch: 1.4 }); ctx.setHud({ coins: coins.collected }); }
      if (rig.rider.grinding && Math.abs(stickX) > 0.7) rig.rider.dismount();
      rig.rider.update(dt, stickX, pump);
      rig.char.animator.play(
        rig.rider.grinding ? SPORT_CLIP.boardGrind : rig.rider.grounded ? SPORT_CLIP.boardIdle : SPORT_CLIP.boardAir,
        { loop: true });
      const banner = tricks.update(dt);
      if (banner) {
        ctx.setHud({ banner });
        if (banner !== 'BAILED') ctx.feel?.impact?.(0.25);
        setTimeout(() => ctx.setHud({ banner: '' }), 900);
      }
      rig.char.root.position.x = Math.max(-PARK_BOUND, Math.min(PARK_BOUND, rig.char.root.position.x));
      rig.char.root.position.z = Math.max(-PARK_BOUND, Math.min(PARK_BOUND, rig.char.root.position.z));
      ctx.setHud({ time: Math.ceil(timeLeft) });
      ctx.camDirector.update(rig.char.root.position, rig.rider.vel, null);
    },

    dispose() { rig?.dispose(); world?.dispose(); coins?.dispose(); SoundKit.stopAmbient(); },
  };
})();
