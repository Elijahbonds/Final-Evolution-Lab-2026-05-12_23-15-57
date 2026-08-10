/**
 * lib/feel/cores/sand-volleyball-constants.ts
 * ===========================================
 * M9 Step 15 — Sand Volleyball skin tunables for the Court-rally core.
 *
 * Sand Volleyball's identity (LINEUP_SPEC): fast QTE RALLY WINDOWS — a long
 * exchange of quick, tight timing hits (bump / set / spike touches). It is the
 * most reflex-heavy Court-rally mode: many contacts per round, short windups,
 * and narrow windows. Placement/timing, no power charge (`useCharge: false`).
 *
 * The engineering line had no single "volleyball" reference file, so every
 * value here is fresh scaffolding synthesised from the Court-rally archetype
 * for Elijah to dial in. All values // TUNE(elijah).
 *
 * A sand-volleyball mode is a thin RallySkin: these constants + sensory
 * presets. Adding this mode never edits the shared CourtRallyCore.
 */

import type { RallyTuning, RallySensory } from './court-rally-core';
import type { SensoryEvent } from '../index';

/** Fast QTE beach-rally feel. Every number // TUNE(elijah). */
export const SAND_VOLLEYBALL_TUNING: RallyTuning = {
  contactsPerRound: 9, // TUNE(elijah) — a long bump/set/spike exchange
  windupMs: 500, // TUNE(elijah) — quick touches; short travel between hits
  windowMs: 105, // TUNE(elijah) — narrow QTE window; spans 210ms
  perfectMs: 34, // TUNE(elijah) — crisp clean touch
  goodMs: 76, // TUNE(elijah) — kept alive
  resultMs: 300, // TUNE(elijah) — brisk beat between touches
  useCharge: false, // TUNE(elijah) — reflex/timing, not a power meter
  chargeRatePerSec: 0, // TUNE(elijah) — unused when useCharge is false
  minPower: 1, // TUNE(elijah) — full power factor (no charge)
  basePoints: 80, // TUNE(elijah) — smaller per-touch, but many touches
  perfectBonus: 0.5, // TUNE(elijah)
  comboStep: 0.2, // TUNE(elijah) — a sustained rally snowballs
  maxCombo: 4.0, // TUNE(elijah) — higher cap: reward long clean rallies
  winContacts: 6, // TUNE(elijah) — six clean touches wins the exchange
};

/** SFX/shake presets per volleyball event. // TUNE(elijah). */
export const SAND_VOLLEYBALL_SENSORY: RallySensory = {
  windowOpen: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.32, shake: 0.02 }, // TUNE(elijah)
  perfect: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.7, shake: 0.09 }, // TUNE(elijah)
  good: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.48, shake: 0.05 }, // TUNE(elijah)
  weak: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.3, shake: 0.03 }, // TUNE(elijah)
  miss: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.26, shake: 0.04 }, // TUNE(elijah)
  win: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.82, shake: 0.12 }, // TUNE(elijah)
};

// Typed handle so unused-import checks stay quiet if presets are trimmed. // TUNE(elijah)
export const _SAND_VOLLEYBALL_SENSORY_TYPECHECK: SensoryEvent | undefined = SAND_VOLLEYBALL_SENSORY.perfect;
