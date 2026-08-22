// BoardRunMode — ONE definition, three sports via config (skate/surf/snowboard):
// ground-snapped riding, kickers, grind rails, coin lines, and on snowboard the
// OVERHEAD LIFT CABLE (big-air grind) + the YETI (hit → knockdown → chase).

import { MeshBuilder, Vector3 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { CharacterPipeline } from '../core/characterPipeline';
import { Rider, type GrindLine } from '../core/GroundRide';
import { CoinField } from '../core/Pickups';
import { Mob, STEERING_PRESETS } from '../core/MobSteering';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { VenueKit } from '../visual/VenueKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { BoardConfig } from './modeConfigs';

export function makeBoardMode(cfg: BoardConfig): ModeDefinition {
  let riderChar: SpawnedCharacter;
  let rider: Rider;
  let coins: CoinField;
  let yeti: Mob | null = null;
  let steer = 0, pump = 0, scoreVal = 0, combo = 1, timeLeft = cfg.runSeconds;
  let yetiChasing = false;

  const grindLines: GrindLine[] = [...cfg.rails];
  if (cfg.liftCable) grindLines.push({ ...cfg.liftCable, bonus: 500 });

  return {
    modeId: cfg.modeId, mood: cfg.mood, camPreset: 'board',

    async load(ctx: ModeContext) {
      // course floor: simple sloped ground until venue GLB is passed in
      const ground = MeshBuilder.CreateGround('ground', { width: cfg.width, height: cfg.length }, ctx.scene);
      ground.position.z = -cfg.length / 2;
      if (cfg.slopeDeg) ground.rotation.x = (cfg.slopeDeg * Math.PI) / 180;

      // Procedural venue + ambient per board family (skate park / snow slope / surf).
      if (cfg.modeId.includes('snow')) {
        VenueKit.buildSlope(ctx.scene, cfg.liftCable);
        EffectsKit.ambient(ctx.scene, 'slope');
      } else if (cfg.modeId === 'surf') {
        EffectsKit.ambient(ctx.scene, 'venice');
      } else {
        VenueKit.buildPark(ctx.scene, cfg.rails);
        EffectsKit.ambient(ctx.scene, 'park');
      }

      riderChar = await CharacterPipeline.spawnPlayer(ctx.scene, cfg.heroUrl, { startClip: 'skate_idle_cruise' });
      rider = new Rider(ctx.scene, riderChar.root, [ground]);

      coins = new CoinField(ctx.scene);
      for (const line of cfg.coinLines) coins.line(line.from, line.to, line.count);
      for (const arc of cfg.coinArcs) coins.arc(arc.from, arc.to, arc.apex, arc.count);

      if (cfg.yeti) {
        const yc = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, {
          position: cfg.yeti.position, tint: '#e8f4ff', scale: 1.35,
        });
        yeti = new Mob(yc, STEERING_PRESETS.yeti);
      }
      timeLeft = cfg.runSeconds; scoreVal = 0; combo = 1;
      ctx.setHud({ time: timeLeft, score: 0, coins: 0 });
    },

    onInput(ctx, e: FelInput) {
      if (e.t === 'stick' && e.side === 'L') steer = e.x;
      if (e.t === 'trigger' && e.side === 'R') pump = e.value;
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') {
          if (rider.grinding) { rider.dismount(); }
          else if (rider.grounded) {
            rider.jump(pump);
            riderChar.animator.play('jump_up', {});
          } else {
            // in air: try to catch a rail — or the LIFT CABLE if high enough
            const line = rider.tryGrind(grindLines);
            if (line) {
              scoreVal += line.bonus * combo;
              combo = Math.min(combo + 0.5, 4);
              EffectsKit.burst(ctx.scene, riderChar.root.position, 'sparks');
              riderChar.animator.play('skate_idle_cruise', { loop: true });
              ctx.setHud({ banner: line === (cfg.liftCable as GrindLine | undefined) ? 'LIFT CABLE GRIND! +500' : 'GRIND!' });
              setTimeout(() => ctx.setHud({ banner: '' }), 900);
            }
          }
        }
        if (!rider.grounded && (e.btn === 'B' || e.btn === 'X' || e.btn === 'Y')) {
          const trick = e.btn === 'B' ? 'skate_kickflip' : e.btn === 'X' ? 'skate_heelflip' : 'snow_grab';
          riderChar.animator.play(trick, {});
          scoreVal += 120 * combo;
          combo = Math.min(combo + 0.25, 4);
        }
      }
    },

    update(ctx, dt) {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        return ctx.end('RUN_COMPLETE', Math.round(scoreVal), {
          coinsCollected: coins.collected, combo: Math.round(combo * 10) / 10,
        });
      }
      const wasAir = !rider.grounded;
      rider.update(dt, steer, pump);
      if (wasAir && rider.grounded) {
        riderChar.animator.play('jump_land', {
          onEnd: () => riderChar.animator.play('skate_idle_cruise', { loop: true }),
        });
      }
      const gained = coins.update(dt, riderChar.root.position);
      if (gained) ctx.setHud({ coins: coins.collected });

      // THE YETI: hit it once → knockdown + it tracks you; escape = outrun/timeout
      if (yeti && yeti.state !== 'downed') {
        const vel = new Vector3(Math.sin(riderChar.root.rotation.y), 0, Math.cos(riderChar.root.rotation.y))
          .scale(Math.hypot(rider.vel.x, rider.vel.z));
        if (!yetiChasing) {
          if (Vector3.Distance(yeti.char.root.position, riderChar.root.position) < 1.4) {
            yetiChasing = true;
            yeti.startPursuit();
            combo = 1;
            riderChar.animator.play('football_tackled_fall', {
              onEnd: () => riderChar.animator.play('skate_idle_cruise', { loop: true }),
            });
            ctx.setHud({ banner: 'YETI! GO GO GO!' });
          }
        } else {
          const contact = yeti.update(dt, riderChar.root.position, vel, 1.2);
          if (yeti.state === 'gaveUp') { yetiChasing = false; ctx.setHud({ banner: '' }); }
          if (contact) {
            combo = 1;
            yeti.onContactResolved();
            riderChar.animator.play('football_tackled_fall', {
              onEnd: () => riderChar.animator.play('skate_idle_cruise', { loop: true }),
            });
          }
        }
      }
      ctx.setHud({ time: Math.ceil(timeLeft), score: Math.round(scoreVal) });
      ctx.camDirector.update(riderChar.root.position, rider.vel, null);
    },

    dispose() { riderChar?.dispose(); yeti?.char.dispose(); coins?.dispose(); },
  };
}
