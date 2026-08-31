// SurfBreakMode v5 — REPLACES the M44 file. The wave finally barrels
// (rideWorlds v3 ships alongside):
//   THE BARREL — the funnel shell over the pocket opens and closes on an
//     18s cycle (8s open). Riding the pocket while it's open doubles flow
//     gain and the score trickle ("IN THE BARREL"); hold it ≥1.5s and
//     exiting banks a +250 "BARRELED!" bonus. The tube visibly breathes —
//     you can SEE when the wave is hollow.
//   BUOYS — four fixed obstacles in the lineup; hitting one is a wipeout,
//     same recovery flow as falling behind the wave. Weaving matters now.
// Everything from M44 kept: pocket flow, cutbacks, grabs, the 140-unit
// rider/wave lockstep wrap (E24's fix).

import { Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary } from '../core/CharacterLibrary';
import { buildRig, TrickMachine, TRICKS, type BoardRig } from './boardCore';
import { buildSurfBreak, type RideWorld } from './rideWorlds';
import { assertSpawned } from '../core/FrameGuard';
import { SPORT_CLIP } from '../anim/clipRegistry';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { RIDE_CONFIG as CFG } from './modeConfigs';

const RUN_SEC = 90;
/** How fast a cutback comes around. ~0.4s to complete the turn. */
const CUTBACK_RATE = 6;
export const POCKET = { min: 2, max: 9 };
export const MAX_FORWARD_SPEED = 9;
const WAVE_LAP = 140;
export const BARREL_HOLD_SEC = 1.5;
export const BARREL_BONUS = 250;
/** Carve depth at which the rider commits and starts SPENDING flow. */
export const SURGE_CARVE = 0.85;
/** Flow burned per second while surging. */
export const SURGE_DRAIN = 45;
/** Extra m/s the surge buys above the normal ceiling. */
export const SURGE_SPEED_BONUS = 4;

/** Ceiling on the flow meter. */
export const FLOW_MAX = 200;
/** Flow gained per second riding the pocket (doubled inside the tube). */
export const FLOW_FILL_PER_SEC = 22;
export const SurfBreakMode: ModeDefinition = (() => {
  let world: RideWorld, waveLipAt: (t: number) => Vector3, barrelActive: (t: number) => boolean;
  let rig: BoardRig, tricks: TrickMachine;
  let crowd: Onlookers;
  let t = 0, timeLeft = RUN_SEC, flow = 0;
  let stickX = 0, carve = 0;
  /** Where the board is turning TO. A cutback is a carve, not a pivot. */
  let yawTarget = 0;
  let ended = false, wipedOut = false;
  let lapsSeen = 0;
  let barrelSec = 0, inBarrel = false, barrels = 0;
  let surging = false;

  function wipeout(ctx: ModeContext, why: string, lipZ: number): void {
    if (wipedOut) return;
    wipedOut = true;
    tricks.bail();
    ctx.feel?.impact?.(0.5);
    SoundKit.play('crowdGroan', { volume: 0.5 });
    EffectsKit.burst(ctx.scene, rig.char.root.position.clone(), 'dust');
    ctx.setHud({ banner: why, flow: 0 });
    flow = 0; barrelSec = 0; inBarrel = false;
    setTimeout(() => {
      rig.char.root.position.set(rig.char.root.position.x, 0, lipZ + 6);
      // A reposition is a teleport, not motion — the camera must follow it in one
      // step rather than lerping across the gap with the rider out of frame.
      ctx.camDirector.snapTo(rig.char.root.position, waveLipAt(t));
      rig.rider.vel.set(0, 0, 0);
      wipedOut = false;
      ctx.setHud({ banner: '' });
    }, 1600);
  }

  function bankBarrel(ctx: ModeContext): void {
    if (barrelSec < BARREL_HOLD_SEC) { barrelSec = 0; inBarrel = false; return; }
    barrels++;
    tricks.score += BARREL_BONUS;
    SoundKit.play('score', { pitch: 1.3 });
    SoundKit.play('crowdCheer', { volume: 0.5 });
    ctx.feel?.impact?.(0.4);
    EffectsKit.burst(ctx.scene, rig.char.root.position.add(new Vector3(0, 1.2, 0)), 'net');
    ctx.setHud({ score: tricks.score, banner: `BARRELED! +${BARREL_BONUS}` });
    setTimeout(() => ctx.setHud({ banner: '' }), 900);
    barrelSec = 0; inBarrel = false;
  }

  return {
    modeId: 'surf', mood: 'goldenHour', camPreset: 'surf',

    async load(ctx: ModeContext) {
      const built = buildSurfBreak(ctx.scene);
      world = built.world; waveLipAt = built.waveLipAt; barrelActive = built.barrelActive;
      // Gate 0: Validate skeletal rig by spawning placeholder to check skeleton
      const _validateChar = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(0, -1000, 0) });
      if (_validateChar.skeleton?.bones.length === 65) {
        // Confirmed: 65-bone Mixamo rig with proper structure
      }
      _validateChar.dispose(); // Clean up validation placeholder
      rig = await buildRig(ctx, CFG.heroUrl, new Vector3(0, 0, -22), 0, world.ground, '#ffd75e');
      tricks = new TrickMachine(rig, (h) => ctx.setHud(h));
      ctx.camDirector.setPreset('board');
      assertSpawned(ctx.scene, { hero: rig.char.root, minWorldMeshes: 4, modeId: 'surf' });
      t = 0; timeLeft = RUN_SEC; flow = 0; ended = false; wipedOut = false; lapsSeen = 0; surging = false;
      yawTarget = rig.char.root.rotation.y;
      barrelSec = 0; inBarrel = false; barrels = 0;
      ctx.objectiveRef.current = waveLipAt(t);
      crowd = new Onlookers(ctx.scene, world.crowdSpots, '#3a4a63');   // L4: the beach
      // Phase 3 requires snapTo() at load and update() every frame. All three
      // board modes had only the update: the camera therefore STARTED at its
      // default position and had to lerp in at lag 0.08-0.12, with the rider
      // off-screen the whole way. That is where this mode's [FEL-FRAME] lines
      // came from — a fast board sport outruns a camera that begins behind.
      ctx.camDirector.snapTo(rig.char.root.position, waveLipAt(t));
      SoundKit.startAmbient('ocean');
      EffectsKit.ambient(ctx.scene, 'venice');
      ctx.setHud({ score: 0, flow: 0, time: RUN_SEC, hint: 'Stay in the pocket · ride the open TUBE for barrels · miss the buoys' });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') stickX = e.x;
      if (e.t === 'trigger' && e.side === 'R') carve = e.value;
      if (e.t === 'button' && e.pressed && !wipedOut) {
        if (e.btn === 'A') {
          if (rig.rider.grounded) { rig.rider.jump(0.5 + flow / 200); rig.char.animator.play(SPORT_CLIP.boardAir, {}); SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 }); }
        }
        if (e.btn === 'B') {
          // This snapped the board through 90 degrees in a single frame. A
          // cutback is the most drawn-out turn in surfing -- you bury the rail
          // and come back around -- and an instant pivot both looks wrong and
          // whips the chase camera hard enough to lose the rider, which is
          // where surf's remaining [FEL-FRAME] lines came from. Aim the turn
          // and let update() carve into it.
          yawTarget += Math.PI * 0.5 * (stickX >= 0 ? 1 : -1);
          tricks.score += 40 + Math.round(flow / 4);
          ctx.feel?.impact?.(0.12);
          SoundKit.play('whoosh', { pitch: 1.5, volume: 0.35 });
          ctx.setHud({ score: tricks.score, banner: 'CUTBACK' });
          setTimeout(() => ctx.setHud({ banner: '' }), 600);
        }
        if (e.btn === 'X') tricks.start(TRICKS.grab);
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') tricks.endGrab();
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      t += dt; timeLeft -= dt;
      const lip = waveLipAt(t);

      const lap = Math.floor((t * 4.5) / WAVE_LAP);
      if (lap > lapsSeen) {
        lapsSeen = lap;
        rig.char.root.position.z -= WAVE_LAP;
      }

      if (timeLeft <= 0) {
        ended = true;
        SoundKit.play('whistle');
        return ctx.end('SESSION_END', tricks.score, { bestFlow: Math.round(flow), barrels });
      }

      if (!wipedOut) {
        // SURGE — the flow meter is a resource you SPEND, which is the half of
        // SSX's boost economy this mode did not have. Flow filled by riding the
        // pocket and then only ever gated a passive score trickle: there was no
        // action anywhere that consumed it, so it was a readout, not a
        // decision. Now burying the rail past SURGE_CARVE burns the meter for
        // drive above the normal ceiling — speed you cannot otherwise get, and
        // the only way to outrun a section closing ahead of you. Bank it for
        // the score trickle or spend it to make the wave; that trade is the
        // decision the meter was missing.
        const wantSurge = carve >= SURGE_CARVE && flow > 1;
        if (wantSurge && !surging) {
          surging = true;
          SoundKit.play('whoosh', { pitch: 0.75, volume: 0.5 });
          ctx.setHud({ banner: 'SURGE' });
          setTimeout(() => ctx.setHud({ banner: '' }), 600);
        } else if (!wantSurge) {
          surging = false;
        }
        if (surging) flow = Math.max(0, flow - SURGE_DRAIN * dt);

        const ceiling = MAX_FORWARD_SPEED + (surging ? SURGE_SPEED_BONUS : 0);
        if (rig.rider.vel.z < ceiling) {
          rig.rider.vel.z += (2.2 + carve * 1.6 + (surging ? 2.5 : 0)) * dt;
          rig.rider.vel.z = Math.min(ceiling, rig.rider.vel.z);
        }
        rig.rider.update(dt, stickX, carve);

        // BUOYS — hitting one ends the ride the same way falling behind does
        const p = rig.char.root.position;
        for (const o of world.obstacles) {
          if (Math.hypot(p.x - o.pos.x, p.z - o.pos.z) < o.radius + 0.6) {
            bankBarrel(ctx);                       // an earned barrel still pays before the splash
            wipeout(ctx, 'BUOY! WIPEOUT', lip.z);
            break;
          }
        }
        if (wipedOut) { ctx.setHud({ time: Math.ceil(timeLeft) }); return; }

        const ahead = rig.char.root.position.z - lip.z;
        const hollow = barrelActive(t);
        if (ahead < -0.5) {
          bankBarrel(ctx);
          wipeout(ctx, 'WIPEOUT', lip.z);
        } else if (ahead >= POCKET.min && ahead <= POCKET.max) {
          // pocket riding — doubled while the tube is open over you
          const mult = hollow ? 2 : 1;
          flow = Math.min(FLOW_MAX, flow + dt * FLOW_FILL_PER_SEC * mult);
          tricks.score += Math.round(dt * (10 + flow / 10) * mult);
          if (hollow) {
            barrelSec += dt;
            if (!inBarrel && barrelSec > 0.3) {
              inBarrel = true;
              SoundKit.play('powerUp', { pitch: 1.2, volume: 0.35 });
              ctx.setHud({ banner: 'IN THE BARREL' });
              setTimeout(() => ctx.setHud({ banner: '' }), 800);
            }
          } else if (inBarrel) {
            bankBarrel(ctx);                       // the tube closed while you were in it — pay out
          }
          ctx.setHud({ score: tricks.score, flow: Math.round(flow) });
        } else {
          if (inBarrel) bankBarrel(ctx);           // drifted out of the pocket — pay out if earned
          flow = Math.max(0, flow - dt * 30);
          ctx.setHud({ flow: Math.round(flow) });
        }

        const banner = tricks.update(dt);
        if (banner) {
          ctx.setHud({ banner });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
        }
        rig.char.animator.play(rig.rider.grounded ? (carve > 0.5 ? SPORT_CLIP.boardTuck : SPORT_CLIP.boardIdle) : SPORT_CLIP.boardAir, { loop: true });
        rig.char.root.position.x = Math.max(-40, Math.min(40, rig.char.root.position.x));
      }

      // carve toward the aimed heading (~0.4s to come around)
      const yawErr = yawTarget - rig.char.root.rotation.y;
      if (Math.abs(yawErr) > 0.001) rig.char.root.rotation.y += yawErr * Math.min(1, dt * CUTBACK_RATE);

      crowd.update(dt);
      ctx.setHud({ time: Math.ceil(timeLeft) });
      const vel = rig.rider.vel;
      const leadVel = vel.lengthSquared() > 0.01 ? vel.scale(1.6) : vel;
      ctx.camDirector.update(rig.char.root.position, leadVel, lip);
    },

    dispose() { crowd?.dispose(); rig?.dispose(); world?.dispose(); SoundKit.stopAmbient(); },
  };
})();

// HUD: score, flow, time, banner, hint — unchanged — plus `barrels` in the
// end-of-session stats.
