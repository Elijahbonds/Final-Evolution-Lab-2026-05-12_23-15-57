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

/**
 * Shake / hit-stop / rumble presets per volleyball event. // TUNE(elijah).
 * HOTFIX (2026-09-24): no `sfx` here. Every entry named an /audio/sfx_*.mp3 that was never under public/, so the
 * bus played silence. Sound belongs to the host that renders the mode (the Babylon modes play synthesized SoundKit
 * cues); no live host builds this core today. See lib/feel/sensory-bus.ts.
 */
export const SAND_VOLLEYBALL_SENSORY: RallySensory = {
  windowOpen: { shake: 0.02 }, // TUNE(elijah)
  perfect: { shake: 0.09 }, // TUNE(elijah)
  good: { shake: 0.05 }, // TUNE(elijah)
  weak: { shake: 0.03 }, // TUNE(elijah)
  miss: { shake: 0.04 }, // TUNE(elijah)
  win: { shake: 0.12 }, // TUNE(elijah)
};

// Typed handle so unused-import checks stay quiet if presets are trimmed. // TUNE(elijah)
export const _SAND_VOLLEYBALL_SENSORY_TYPECHECK: SensoryEvent | undefined = SAND_VOLLEYBALL_SENSORY.perfect;
