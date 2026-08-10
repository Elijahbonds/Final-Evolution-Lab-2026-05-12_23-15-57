/**
 * lib/feel/cores/vault-constants.ts
 * =================================
 * M9 Step 8 — Vault (gymnastics) skin tunables for the Air-session core.
 *
 * Vault's identity (LINEUP_SPEC): a CADENCE run-up (you must pump alternating
 * taps to build speed — POSITIVE runDrag means the runway does NOT give you
 * speed for free, unlike big-air's slope), an auto-punch off the table (the
 * launch fires when you reach the board), AirTrick flips, and a
 * stick-the-landing window (stuck / clean / sketchy / crash).
 *
 * No dedicated donor config existed for vault, so every value here is fresh
 * scaffolding for Elijah to dial in. All values // TUNE(elijah).
 *
 * A vault mode is a thin AirSessionSkin: these constants + sensory presets.
 * Adding this mode never edits the shared AirSessionCore.
 */

import type { AirSessionTuning, AirSessionSensoryEvent } from './air-session-core';
import type { SensoryEvent, AirTrickOpts } from '../index';

/** Gymnastics vault feel. Every number // TUNE(elijah). */
export const VAULT_TUNING: AirSessionTuning = {
  runDrag: 3.0, // TUNE(elijah) — POSITIVE: runway friction; cadence taps must carry you
  maxRunSpeed: 11.0, // TUNE(elijah) — a sprinter's top runway speed (m/s)
  perfectImpulse: 1.7, // TUNE(elijah) — a crisp footstrike drives you on
  goodImpulse: 1.0, // TUNE(elijah)
  faultSpeedMult: 0.6, // TUNE(elijah) — a stumble on the runway costs dearly
  launchZ: -22, // TUNE(elijah) — the vault table sits 22m down the runway
  baseLaunch: 4.5, // TUNE(elijah) — the board punch floor (m/s)
  speedLaunchBonus: 6.5, // TUNE(elijah) — a fast run = big block off the table
  airForwardMin: 2.5, // TUNE(elijah)
  airForwardFactor: 0.7, // TUNE(elijah)
  basePoints: 120, // TUNE(elijah) — gymnastics rewards form
  pointsPerRotation: 110, // TUNE(elijah)
  gradePoints: {
    stuck: 2.0, // TUNE(elijah) — "stuck the landing" is the whole sport
    clean: 1.0, // TUNE(elijah)
    sketchy: 0.4, // TUNE(elijah) — a hop-out is heavily deducted
    crash: 0, // TUNE(elijah)
  },
  attemptsPerRound: 2, // TUNE(elijah) — two vaults, best counts
  landBeatMs: 1000, // TUNE(elijah) — the salute beat between vaults
  cadenceTargetMs: 230, // TUNE(elijah) — sprint-run footstrike rhythm
  cadencePerfectMs: 42, // TUNE(elijah)
  cadenceGoodMs: 90, // TUNE(elijah)
};

/** Vault flip feel — tight form tolerance (judged sport). // TUNE(elijah) */
export const VAULT_TRICK: AirTrickOpts = {
  perTapRotation: 0.5, // TUNE(elijah) — half a flip per tap
  cleanTolerance: 0.11, // TUNE(elijah) — stricter than a board trick
  stickWindowMs: 180, // TUNE(elijah)
};

/** SFX/shake presets per air-session event. // TUNE(elijah). */
export const VAULT_SENSORY: Partial<Record<AirSessionSensoryEvent, SensoryEvent>> = {
  launch: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.7, shake: 0.1 }, // TUNE(elijah) — the board punch
  trickTap: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.35 }, // TUNE(elijah)
  landClean: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.6, shake: 0.12, hitStopMs: 45 }, // TUNE(elijah)
  landStuck: { sfx: '/audio/sfx_crowd_cheer.mp3', volume: 1.0, shake: 0.22, hitStopMs: 100, rumbleMs: 180, rumbleStrength: 0.75 }, // TUNE(elijah)
  landSketchy: { sfx: '/audio/sfx_punch_impact.mp3', volume: 0.45, shake: 0.1 }, // TUNE(elijah)
  landCrash: { sfx: '/audio/sfx_punch_impact.mp3', volume: 1.0, shake: 0.28, hitStopMs: 110, rumbleMs: 300, rumbleStrength: 0.9 }, // TUNE(elijah)
};
