/**
 * lib/feel/cores/clay-rally-constants.ts
 * ======================================
 * M9 Step 12 — Clay Rally skin tunables for the Court-rally core.
 *
 * Clay Rally's identity (LINEUP_SPEC): a baseline clay-court exchange decided
 * on TIMED CONTACTS — the ball comes back, a swing window opens, and a
 * well-timed contact keeps (and wins) the rally. It is a "40-15 game": win
 * enough clean contacts and you take the game. No charge/release contract —
 * clay is about placement and timing, not raw power — so useCharge is false.
 *
 * The engineering line had no single "rally" reference file (each rally sport
 * was bespoke), so every value here is fresh scaffolding synthesised from the
 * Court-rally archetype for Elijah to dial in. All values // TUNE(elijah).
 *
 * A clay-rally mode is a thin RallySkin: these constants + sensory presets.
 * Adding this mode never edits the shared CourtRallyCore.
 */

import type { RallyTuning, RallySensory } from './court-rally-core';
import type { SensoryEvent } from '../index';

/** Baseline clay-court rally feel. Every number // TUNE(elijah). */
export const CLAY_RALLY_TUNING: RallyTuning = {
  contactsPerRound: 8, // TUNE(elijah) — up to eight exchanges in the game
  windupMs: 620, // TUNE(elijah) — ball travel time before the swing window
  windowMs: 150, // TUNE(elijah) — half-width; window spans 300ms total
  perfectMs: 45, // TUNE(elijah) — clean, on-the-rise contact
  goodMs: 100, // TUNE(elijah) — solid return
  resultMs: 420, // TUNE(elijah) — beat between exchanges
  useCharge: false, // TUNE(elijah) — clay is timing/placement, not power
  chargeRatePerSec: 0, // TUNE(elijah) — unused when useCharge is false
  minPower: 1, // TUNE(elijah) — full power factor (no charge)
  basePoints: 100, // TUNE(elijah)
  perfectBonus: 0.6, // TUNE(elijah) — a clean winner scores +60%
  comboStep: 0.25, // TUNE(elijah) — momentum builds across a long rally
  maxCombo: 3.0, // TUNE(elijah) — cap the streak multiplier
  winContacts: 5, // TUNE(elijah) — five clean contacts wins the 40-15 game
};

/** SFX/shake presets per rally event. // TUNE(elijah). */
export const CLAY_RALLY_SENSORY: RallySensory = {
  windowOpen: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.35, shake: 0.02 }, // TUNE(elijah)
  perfect: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.7, shake: 0.09 }, // TUNE(elijah)
  good: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.5, shake: 0.05 }, // TUNE(elijah)
  weak: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.3, shake: 0.03 }, // TUNE(elijah)
  miss: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.25, shake: 0.04 }, // TUNE(elijah)
  win: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.8, shake: 0.12 }, // TUNE(elijah)
};

// Keep an explicit typed handle so unused-import checks stay quiet if the
// sensory presets are trimmed during tuning. // TUNE(elijah)
export const _CLAY_RALLY_SENSORY_TYPECHECK: SensoryEvent | undefined = CLAY_RALLY_SENSORY.perfect;
