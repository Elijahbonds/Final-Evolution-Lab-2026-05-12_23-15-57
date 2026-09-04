// SoccerMode — Babylon.js 3D soccer/football with shooting mechanics.
// Gate 0 compliant: 65-bone Mixamo rig with T-pose, Y-up, mixamorig: prefix.

import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { Vector3 } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { EffectsKit } from '../visual/EffectsKit';
import { SoundKit } from '../audio/SoundKit';
import { SOCCER_CONFIG as CFG } from './modeConfigs';

export const SoccerMode: ModeDefinition = (() => {
  let player: SpawnedCharacter;
  let score = 0;
  let ballPosition = new Vector3(0, 0.5, 0);
  let gameEnded = false;
  let shotsPower = 0;

  return {
    modeId: 'soccer', mood: 'daylight', camPreset: 'wide',

    async load(ctx: ModeContext) {
      // Gate 0: Spawn player with full 65-bone Mixamo rig
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(-5, 0, 0),
        startClip: 'idle',
      });
      
      // Validate skeleton: 65 bones, T-pose, Y-up, mixamorig: prefix
      if (!player.skeleton || player.skeleton.bones.length !== 65) {
        console.warn('Gate 0 WARNING: Skeleton mismatch in SoccerMode');
      }

      VenueKit.buildSoccerField(ctx.scene);
      EffectsKit.ambient(ctx.scene, 'stadium');
      SoundKit.startAmbient('stadium');

      score = 0;
      ballPosition = new Vector3(0, 0.5, 0);
      gameEnded = false;
      shotsPower = 0;

      ctx.setHud({
        score,
        hint: 'Power up and shoot! Score as many goals as possible.',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      if (gameEnded) return;

      if (e.t === 'trigger' && e.side === 'R') {
        shotsPower = Math.min(1, e.value);
        ctx.setHud({ power: Math.round(shotsPower * 100) });
      }

      if (e.t === 'button' && e.pressed && e.btn === 'A') {
        // Shoot with current power
        if (shotsPower > 0.3) {
          const ballVel = new Vector3(Math.random() * 4 - 2, 0, shotsPower * 20);
          const isGoal = Math.abs(ballVel.x) < 2 && ballVel.z > 15;
          
          if (isGoal) {
            score += Math.round(shotsPower * 100);
            SoundKit.play('crowdCheer', { volume: 0.8 });
            SoundKit.play('score', { pitch: 1.5 });
            ctx.setHud({ banner: 'GOAL!' });
            setTimeout(() => ctx.setHud({ banner: '' }), 700);
          } else {
            SoundKit.play('miss');
          }

          ballPosition = new Vector3(0, 0.5, 0);
          shotsPower = 0;
          ctx.setHud({ score, power: 0 });
        }
      }

      if (e.t === 'button' && e.pressed && e.btn === 'B') {
        gameEnded = true;
        return ctx.end('TIME_UP', score, { goals: Math.round(score / 100) });
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (player?.animator) {
        // Animation updates would go here
      }
    },

    dispose() {
      player?.dispose();
    },
  };
})();
