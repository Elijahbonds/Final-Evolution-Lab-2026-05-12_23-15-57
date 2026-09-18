/**
 * lib/feel/cores/dunk-skin.ts
 * ===========================
 * M9 Step 2 — Dunk mode skin for the Court/free-3D core.
 *
 * The reference slice: this skin declares the dunk's states/arc/sensory/
 * camera by CONFIG only — it adds no gameplay code of its own. It reproduces
 * the FEEL_REFERENCE_SPEC measured dunk numbers (apex ~1.36m, hang ~516ms,
 * arc lock-on to the rim, 10/10 zero-teleport loops) using the shared
 * feelConfig values verbatim.
 *
 * NOTE ON THE LIVE APP: the shipping components/games/dunk-game-3d.tsx uses
 * its own higher, arcade-contest jump values (vy ≈ 5.5 + power·3.5) tuned for
 * spectacle. Those are preserved untouched. This skin is the SHARED-SYSTEMS
 * reference the live component migrates onto under visual acceptance; it
 * proves the core matches the engineering-line feel targets.
 */

import { feelConfig, type FeelConfig, type Vec3 } from '../index';
import type { CourtSkin } from './court-core';

/** Venice court hoop, matching HOOP_POS in dunk-game-3d.tsx space. */
export const DUNK_HOOP: Vec3 = { x: 0, y: 3.05, z: 0 };

export interface DunkSkinOpts {
  feel?: FeelConfig;
  speedScale?: number;
  hangBonus?: number;
  hoop?: Vec3;
  /** Sensory dispatch hook (wire to a SensoryBus in the render layer). */
  onSensory?: CourtSkin['onSensory'];
  onPhase?: CourtSkin['onPhase'];
}

/**
 * Build the dunk CourtSkin. The lock-on resolver locks a mid-air dunk within
 * lockOnRadius of the hoop onto a rim-approach point (standoff in front of the
 * rim, at rimApproachY), matching FEEL_REFERENCE_SPEC §5.
 */
export function makeDunkSkin(opts: DunkSkinOpts = {}): CourtSkin {
  const feel = opts.feel ?? feelConfig;
  const hoop = opts.hoop ?? DUNK_HOOP;
  const a = feel.dunkArc;

  return {
    feel,
    speedScale: opts.speedScale,
    hangBonus: opts.hangBonus,
    jumpImpulse: feel.jump.impulse,
    bounds: feel.court,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    resolveLockOn: (pos, f) => {
      const dx = hoop.x - pos.x;
      const dz = hoop.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > a.lockOnRadius) return null; // too far — plain ballistic jump
      // Rim-approach point: stop `rimStandoff` in front of the rim center,
      // at slam height rimApproachY.
      const inv = dist > 1e-4 ? 1 / dist : 0;
      const target: Vec3 = {
        x: hoop.x - dx * inv * a.rimStandoff,
        y: a.rimApproachY,
        z: hoop.z - dz * inv * a.rimStandoff,
      };
      const apexY = Math.max(pos.y, target.y) + a.apexBoostM;
      return { target, apexY, durationMs: a.durationMs };
    },
  };
}

/** SFX map for the dunk (the app already ships these MP3s). */
export const DUNK_SENSORY_SFX = {
  swoosh: '/audio/sfx_basketball_swoosh.mp3',
  crowd: '/audio/sfx_crowd_cheer.mp3',
} as const;

export default makeDunkSkin;
