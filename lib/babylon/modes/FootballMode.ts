// FootballMode — 4-down drive structure, skinned pursuing defenders (visible,
// lit, animated), juke/spin/hurdle evades with i-frames, survivable opening.

import { Vector3 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { CharacterPipeline } from '../core/characterPipeline';
import { Mob, MobPool, STEERING_PRESETS } from '../core/MobSteering';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { VenueKit } from '../visual/VenueKit';
import { EffectsKit } from '../visual/EffectsKit';
import { FOOTBALL_CONFIG as CFG } from './modeConfigs';

export const FootballMode: ModeDefinition = (() => {
  let runner: SpawnedCharacter;
  let pool: MobPool;
  let steer = 0, yards = 0, down = 1, seriesStartYd = 0, evaded = 0, score = 0;
  let evadeUntil = 0;           // i-frame window after a move
  let running = true;

  async function spawnDefenderLine(ctx: ModeContext, atYd: number): Promise<void> {
    for (let i = 0; i < CFG.defendersPerLine; i++) {
      const char = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3((i - 1) * 3.2 + (atYd % 2 ? 1.4 : -1.4), 0, -ydToZ(atYd)),
        tint: CFG.defenderTint,
      });
      const mob = new Mob(char, STEERING_PRESETS.defender);
      mob.startPursuit();
      pool.add(mob);
    }
  }
  const ydToZ = (yd: number) => yd * CFG.metersPerYard;

  function evade(ctx: ModeContext, clip: string, lateral: number): void {
    if (performance.now() < evadeUntil) return;
    evadeUntil = performance.now() + CFG.iframeMs;
    runner.root.position.x += lateral;
    runner.animator.play(clip, {
      onEnd: () => runner.animator.play('football_sprint_return', { loop: true }),
    });
  }

  return {
    modeId: 'football', mood: 'nightGame', camPreset: 'runner',

    async load(ctx) {
      VenueKit.buildGridiron(ctx.scene);
      EffectsKit.ambient(ctx.scene, 'gridiron');
      runner = await CharacterPipeline.spawnPlayer(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 0), yawRad: Math.PI,   // chest DOWN-field
        startClip: 'football_sprint_return',
      });
      pool = new MobPool();
      yards = 0; down = 1; seriesStartYd = 0; evaded = 0; score = 0; running = true;
      // Survivable opening: first line spawns past the grace distance
      for (let line = 0; line < CFG.lines; line++) {
        await spawnDefenderLine(ctx, CFG.graceYards + line * CFG.lineSpacingYards);
      }
      ctx.setHud({ down: `${down} & ${CFG.yardsToGain}`, yards: 0, evaded: 0 });
    },

    onInput(ctx, e: FelInput) {
      if (e.t === 'stick' && e.side === 'L') steer = e.x;
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'X') evade(ctx, 'football_juke_left', -1.6);
        if (e.btn === 'Y') evade(ctx, 'football_juke_right', 1.6);
        if (e.btn === 'B') evade(ctx, 'football_spin_move', 0);
        if (e.btn === 'A') evade(ctx, 'jump_up', 0);                 // hurdle
      }
      if (e.t === 'trigger' && e.side === 'R' && e.value > 0.5) evade(ctx, 'football_stiff_arm', 0);
    },

    update(ctx, dt) {
      if (!running) return;
      const speed = CFG.runSpeed + Math.min(3, yards / 25);          // breakaway ramp
      const vel = new Vector3(steer * 5, 0, -speed);
      runner.root.position.addInPlace(vel.scale(dt));
      runner.root.position.x = Math.max(-CFG.halfWidth, Math.min(CFG.halfWidth, runner.root.position.x));
      yards = Math.max(yards, Math.round(-runner.root.position.z / CFG.metersPerYard));

      // Down/series logic
      if (yards - seriesStartYd >= CFG.yardsToGain) {
        seriesStartYd = yards; down = 1;
        ctx.setHud({ banner: 'FIRST DOWN!', down: `1 & ${CFG.yardsToGain}` });
        setTimeout(() => ctx.setHud({ banner: '' }), 900);
      }
      if (yards >= CFG.fieldYards) {
        running = false;
        score += 7;
        // M29 premium TD feel: full signature impact (hit-stop + shake + flash + slow-mo) //TUNE(elijah)
        ctx.juice.impact(runner.root.position.clone(), 'TOUCHDOWN!', { color: '#9fb7ff', slow: true });
        runner.animator.play('football_touchdown_spike', {});
        return ctx.end('TOUCHDOWN', score * 10 + evaded * 15 + yards, { yards, evaded, downs: down });
      }

      const contacts = pool.update(dt, runner.root.position, vel);
      const invulnerable = performance.now() < evadeUntil;
      for (const mob of contacts) {
        if (invulnerable) {
          evaded++; mob.down();                                       // whiff
          // M29 premium evade feel: quick pop + light shake (no hit-stop on ordinary jukes) //TUNE(elijah)
          ctx.juice.scorePop(runner.root.position.clone(), 'EVADED!', '#34e89e');
          ctx.juice.shake(0.06, 90);
          ctx.setHud({ evaded });
          continue;
        }
        running = false;
        runner.animator.play('football_tackled_fall', {});
        down++;
        if (down > CFG.downs) {
          return ctx.end(`TACKLED_${yards}YD`, evaded * 15 + yards, { yards, evaded, downs: CFG.downs });
        }
        // reset for next down after the fall
        setTimeout(() => {
          runner.root.position.set(0, 0, -ydToZ(yards));
          runner.animator.play('football_sprint_return', { loop: true });
          running = true;
          ctx.setHud({ down: `${down} & ${CFG.yardsToGain - (yards - seriesStartYd)}` });
        }, 1100);
        break;
      }
      ctx.setHud({ yards });
      ctx.camDirector.update(runner.root.position, vel, null);
    },

    dispose() { runner?.dispose(); pool?.dispose(); },
  };
})();
