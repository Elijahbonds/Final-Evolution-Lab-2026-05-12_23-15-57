/**
 * lib/feel/cores/penalty-shootout-constants.ts
 * ============================================
 * M9 Step 13 — Penalty Shootout skin tunables for the Court-rally core.
 *
 * Penalty Shootout's identity (LINEUP_SPEC): a best-of-five spot-kick duel —
 * five discrete TIMED contacts, each a single strike at the ball; sink enough
 * and you win the shootout (e.g. "won 3-2"). Each kick is placement/timing,
 * not a power charge, so useCharge is false. A tight window makes each strike
 * tense and individually meaningful (unlike a long clay rally).
 *
 * The engineering line had no single "shootout" reference file, so every value
 * here is fresh scaffolding synthesised from the Court-rally archetype for
 * Elijah to dial in. All values // TUNE(elijah).
 *
 * A penalty-shootout mode is a thin RallySkin: these constants + sensory
 * presets. Adding this mode never edits the shared CourtRallyCore.
 */

import type { RallyTuning, RallySensory } from './court-rally-core';
import type { SensoryEvent } from '../index';

/** Best-of-five spot-kick feel. Every number // TUNE(elijah). */
export const PENALTY_SHOOTOUT_TUNING: RallyTuning = {
  contactsPerRound: 5, // TUNE(elijah) — five spot kicks
  windupMs: 720, // TUNE(elijah) — the run-up before the strike window
  windowMs: 120, // TUNE(elijah) — tighter than a rally; window spans 240ms
  perfectMs: 38, // TUNE(elijah) — top-corner strike
  goodMs: 85, // TUNE(elijah) — on target
  resultMs: 640, // TUNE(elijah) — longer beat: keeper reset, walk-up drama
  useCharge: false, // TUNE(elijah) — placement/timing, not a power meter
  chargeRatePerSec: 0, // TUNE(elijah) — unused when useCharge is false
  minPower: 1, // TUNE(elijah) — full power factor (no charge)
  basePoints: 100, // TUNE(elijah)
  perfectBonus: 0.5, // TUNE(elijah) — a top-corner strike scores +50%
  comboStep: 0.2, // TUNE(elijah) — nerves of steel bonus for a streak
  maxCombo: 2.0, // TUNE(elijah)
  winContacts: 3, // TUNE(elijah) — first to three goals wins (3-2 result)
};

/** SFX/shake presets per shootout event. // TUNE(elijah). */
export const PENALTY_SHOOTOUT_SENSORY: RallySensory = {
  windowOpen: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.4, shake: 0.02 }, // TUNE(elijah)
  perfect: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.75, shake: 0.11 }, // TUNE(elijah)
  good: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.55, shake: 0.06 }, // TUNE(elijah)
  weak: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.3, shake: 0.04 }, // TUNE(elijah)
  miss: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.28, shake: 0.05 }, // TUNE(elijah)
  win: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.85, shake: 0.14 }, // TUNE(elijah)
};

// Typed handle so unused-import checks stay quiet if presets are trimmed. // TUNE(elijah)
export const _PENALTY_SENSORY_TYPECHECK: SensoryEvent | undefined = PENALTY_SHOOTOUT_SENSORY.perfect;
