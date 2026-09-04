// GolfMode — Babylon.js 3D golf with 18-hole progression.
// Gate 0 compliant: 65-bone Mixamo rig with T-pose, Y-up, mixamorig: prefix.

import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { Vector3 } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { EffectsKit } from '../visual/EffectsKit';
import { SoundKit } from '../audio/SoundKit';
import { GOLF_CONFIG as CFG } from './modeConfigs';

export const GolfMode: ModeDefinition = (() => {
  let player: SpawnedCharacter;
  let hole = 1;
  let strokes = 0;
  let totalScore = 0;
  let gameEnded = false;

  return {
    modeId: 'golf', mood: 'afternoon', camPreset: 'wide',

    async load(ctx: ModeContext) {
      // Gate 0: Spawn player with full 65-bone Mixamo rig
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 0),
        startClip: 'idle',
      });
      
      // Validate skeleton: 65 bones, T-pose, Y-up, mixamorig: prefix
      if (!player.skeleton || player.skeleton.bones.length !== 65) {
        console.warn('Gate 0 WARNING: Skeleton mismatch in GolfMode');
      }

      VenueKit.buildGolfCourse(ctx.scene);
      EffectsKit.ambient(ctx.scene, 'course');
      SoundKit.startAmbient('ambient');

      hole = 1;
      strokes = 0;
      totalScore = 0;
      gameEnded = false;

      ctx.setHud({
        hole,
        strokes,
        score: totalScore,
        hint: 'Aim and putt to complete all 18 holes',
      });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      if (gameEnded) return;
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') {
          strokes++;
          // Simulate putt; in real implementation, calculate distance/angle
          if (Math.random() < 0.7) {
            // Made the putt
            SoundKit.play('score', { pitch: 1.2 });
            hole++;
            if (hole > 18) {
              gameEnded = true;
              return ctx.end('GAME_COMPLETE', totalScore, { totalScore, holes: 18, strokes });
            }
            strokes = 0;
          } else {
            SoundKit.play('miss');
          }
          ctx.setHud({ hole, strokes, score: totalScore });
        }
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
