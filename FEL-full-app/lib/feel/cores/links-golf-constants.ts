/**
 * lib/feel/cores/links-golf-constants.ts
 * ======================================
 * M9 Step 14 — Links Golf skin tunables for the Court-rally core.
 *
 * Links Golf's identity (LINEUP_SPEC): a CHARGE / RELEASE power contract —
 * hold to build the swing, release to lock power, then time the contact; a
 * perfectly-timed, well-powered strike is a hole-in-one. This is the one
 * Court-rally mode that turns the core's charge contract ON (`useCharge:
 * true`): power scales the score, and the `chargeReleased` flag reports the
 * hold-then-release contract was honoured.
 *
 * The engineering line had no single "golf" reference file, so every value
 * here is fresh scaffolding synthesised from the Court-rally archetype (its
 * charge/release path mirrors the proven ArcDrive charge/handback idea) for
 * Elijah to dial in. All values // TUNE(elijah).
 *
 * A links-golf mode is a thin RallySkin: these constants + sensory presets.
 * Adding this mode never edits the shared CourtRallyCore.
 */

import type { RallyTuning, RallySensory } from './court-rally-core';
import type { SensoryEvent } from '../index';

/** Charge-and-time links golf feel. Every number // TUNE(elijah). */
export const LINKS_GOLF_TUNING: RallyTuning = {
  contactsPerRound: 5, // TUNE(elijah) — five holes in a round
  windupMs: 760, // TUNE(elijah) — the backswing: hold to build power here
  windowMs: 140, // TUNE(elijah) — impact window; spans 280ms
  perfectMs: 40, // TUNE(elijah) — flush contact -> hole-in-one candidate
  goodMs: 95, // TUNE(elijah) — on the green
  resultMs: 560, // TUNE(elijah) — ball-roll settle beat
  useCharge: true, // TUNE(elijah) — THIS mode uses charge/release
  chargeRatePerSec: 1.5, // TUNE(elijah) — full power after ~0.67s of hold
  minPower: 0.35, // TUNE(elijah) — a no-charge tap still dribbles forward
  basePoints: 100, // TUNE(elijah)
  perfectBonus: 1.0, // TUNE(elijah) — a flush hole-in-one doubles the base
  comboStep: 0.3, // TUNE(elijah) — birdie streak momentum
  maxCombo: 2.5, // TUNE(elijah)
  winContacts: 3, // TUNE(elijah) — three clean holes takes the round
};

/** SFX/shake presets per golf event. // TUNE(elijah). */
export const LINKS_GOLF_SENSORY: RallySensory = {
  windowOpen: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.35, shake: 0.02 }, // TUNE(elijah)
  perfect: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.75, shake: 0.1 }, // TUNE(elijah)
  good: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.5, shake: 0.05 }, // TUNE(elijah)
  weak: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.3, shake: 0.03 }, // TUNE(elijah)
  miss: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.25, shake: 0.03 }, // TUNE(elijah)
  win: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.85, shake: 0.12 }, // TUNE(elijah)
};

// Typed handle so unused-import checks stay quiet if presets are trimmed. // TUNE(elijah)
export const _LINKS_GOLF_SENSORY_TYPECHECK: SensoryEvent | undefined = LINKS_GOLF_SENSORY.perfect;
