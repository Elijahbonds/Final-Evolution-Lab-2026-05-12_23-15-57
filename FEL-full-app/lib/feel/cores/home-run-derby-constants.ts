/**
 * lib/feel/cores/home-run-derby-constants.ts
 * ==========================================
 * M9 Step 16 — Home Run Derby skin tunables for the Court-rally core.
 *
 * Home Run Derby's identity (LINEUP_SPEC): SIX timed swings, and a clean
 * derby is six-for-six — connect on every pitch. It is the "all or clean
 * sweep" Court-rally mode: `winContacts` equals `contactsPerRound`, so a
 * single mistimed swing costs the sweep. A flush contact is a moonshot, hence
 * a large perfect bonus. Timing/contact, no power charge (`useCharge: false`)
 * — the drama is landing all six, not holding a meter.
 *
 * The engineering line had no single "derby" reference file, so every value
 * here is fresh scaffolding synthesised from the Court-rally archetype for
 * Elijah to dial in. All values // TUNE(elijah).
 *
 * A home-run-derby mode is a thin RallySkin: these constants + sensory
 * presets. Adding this mode never edits the shared CourtRallyCore.
 */

import type { RallyTuning, RallySensory } from './court-rally-core';
import type { SensoryEvent } from '../index';

/** Six-swing derby feel. Every number // TUNE(elijah). */
export const HOME_RUN_DERBY_TUNING: RallyTuning = {
  contactsPerRound: 6, // TUNE(elijah) — six pitches in the derby
  windupMs: 680, // TUNE(elijah) — pitch travel before the swing window
  windowMs: 130, // TUNE(elijah) — swing window; spans 260ms
  perfectMs: 40, // TUNE(elijah) — barrelled contact -> moonshot
  goodMs: 90, // TUNE(elijah) — solid contact
  resultMs: 520, // TUNE(elijah) — ball-flight beat between pitches
  useCharge: false, // TUNE(elijah) — timing/contact, not a power meter
  chargeRatePerSec: 0, // TUNE(elijah) — unused when useCharge is false
  minPower: 1, // TUNE(elijah) — full power factor (no charge)
  basePoints: 120, // TUNE(elijah) — big cuts, big numbers
  perfectBonus: 1.5, // TUNE(elijah) — a barrelled moonshot scores +150%
  comboStep: 0.4, // TUNE(elijah) — a hot streak snowballs fast
  maxCombo: 3.5, // TUNE(elijah)
  winContacts: 6, // TUNE(elijah) — six-for-six: connect on every pitch
};

/** SFX/shake presets per derby event. // TUNE(elijah). */
export const HOME_RUN_DERBY_SENSORY: RallySensory = {
  windowOpen: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.35, shake: 0.02 }, // TUNE(elijah)
  perfect: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.8, shake: 0.13 }, // TUNE(elijah)
  good: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.55, shake: 0.06 }, // TUNE(elijah)
  weak: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.3, shake: 0.03 }, // TUNE(elijah)
  miss: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.26, shake: 0.04 }, // TUNE(elijah)
  win: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.9, shake: 0.16 }, // TUNE(elijah)
};

// Typed handle so unused-import checks stay quiet if presets are trimmed. // TUNE(elijah)
export const _HOME_RUN_DERBY_SENSORY_TYPECHECK: SensoryEvent | undefined = HOME_RUN_DERBY_SENSORY.perfect;
