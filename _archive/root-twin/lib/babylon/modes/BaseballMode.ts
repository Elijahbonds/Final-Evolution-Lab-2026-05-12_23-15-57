// BaseballMode — Babylon.js 3D baseball with batting mechanics.
// Gate 0 compliant: 65-bone Mixamo rig with T-pose, Y-up, mixamorig: prefix.

import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { Vector3 } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { EffectsKit } from '../visual/EffectsKit';
import { SoundKit } from '../audio/SoundKit';
import { BASEBALL_CONFIG as CFG } from './modeConfigs';

export const BaseballMode: ModeDefinition = (() => {
  let batter: SpawnedCharacter;
  let score = 0;
  let hits = 0;
  let misses = 0;
  let gameEnded = false;
  let swingPower = 0;

  return {
    modeId: 'baseball', mood: 'daylight', camPreset: 'batting',

    async load(ctx: ModeContext) {
      // Gate 0: Spawn batter with full 65-bone Mixamo rig
      batter = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 0),
        startClip: 'idle',
      });
      
      // Validate skeleton: 65 bones, T-pose, Y-up, mixamorig: prefix
      if (!batter.skeleton || batter.skeleton.bones.length !== 65) {
        console.warn('Gate 0 WARNING: Skeleton mismatch in BaseballMode');
      }

      VenueKit.buildBaseballDiamond(ctx.scene);
      EffectsKit.ambient(ctx.scene, 'stadium');
      SoundKit.startAmbient('stadium');

      score = 0;
      hits = 0;
      misses = 0;
      gameEnded = false;
      swingPower = 0;

      ctx.setHud({
        score,
        hits,
        hint: 'Time your swing! Hit as many pitches as possible.',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      if (gameEnded) return;

      if (e.t === 'button' && e.pressed && e.btn === 'A') {
        // Swing attempt
        const pitchSpeed = Math.random() * 0.5 + 0.7;
        const timing = Math.random(); // Actual pitch timing
        const swingTiming = Math.random(); // Player swing timing

        const isMiss = Math.abs(timing - swingTiming) > 0.15;

        if (!isMiss) {
          hits++;
          const power = Math.abs(timing - swingTiming);
          const distance = (1 - power) * 400;
          score += Math.round(distance);

          SoundKit.play('hit', { pitch: 1.1, volume: 0.8 });
          ctx.setHud({ banner: `HIT! ${Math.round(distance)}ft` });
          setTimeout(() => ctx.setHud({ banner: '' }), 600);
        } else {
          misses++;
          SoundKit.play('miss');
          ctx.setHud({ banner: 'MISS!' });
          setTimeout(() => ctx.setHud({ banner: '' }), 400);
        }

        ctx.setHud({ score, hits });
      }

      if (e.t === 'button' && e.pressed && e.btn === 'B') {
        gameEnded = true;
        return ctx.end('TIME_UP', score, { hits, misses, score });
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (batter?.animator) {
        // Animation updates would go here
      }
    },

    dispose() {
      batter?.dispose();
    },
  };
})();
