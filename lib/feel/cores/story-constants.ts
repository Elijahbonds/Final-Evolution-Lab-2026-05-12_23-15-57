/**
 * lib/feel/cores/story-constants.ts
 * =================================
 * M9 Step 17 — Story Mode skin tunables for the Board/Story core.
 *
 * Story Mode's identity (LINEUP_SPEC): a turn-based board runner across the
 * Venice Beach zones — roll, hop, collect shards, and duel each zone's boss.
 * The board layout + boss roster are DONOR data (story-board-data.ts); the
 * feel numbers that dress that board live HERE and are every one
 * // TUNE(elijah), because the donor kept them in `feelConfig.story`, which
 * was NOT among the ported feel systems.
 *
 * A story mode is a thin StorySkin: these constants + sensory presets. Adding
 * it never edits the shared StoryCore.
 */

import type { StoryTuning, StorySensoryEvent } from './story-core';
import type { SensoryEvent } from '../index';

/** Venice Beach story feel. Every number // TUNE(elijah). */
export const STORY_TUNING: StoryTuning = {
  startHp: 100, // TUNE(elijah) — hero HP at the start of a run
  retreatHp: 60, // TUNE(elijah) — HP restored after a knockout retreat
  hopApexBonus: 0.9, // TUNE(elijah) — hop arc rises this far above the taller tile (m)
  hopDurationMs: 340, // TUNE(elijah) — one board hop takes this long
  bossFirstAttackS: 1.4, // TUNE(elijah) — grace before a boss's first swing
  bossAttackBaseS: 2.2, // TUNE(elijah) — base seconds between swings (÷ aggression)
  bossDmgMin: 8, // TUNE(elijah) — boss hit floor
  bossDmgMax: 16, // TUNE(elijah) — boss hit ceiling
  strikeCooldownS: 0.45, // TUNE(elijah) — min seconds between player strikes
  strikeMin: 10, // TUNE(elijah) — player strike floor
  strikeMax: 20, // TUNE(elijah) — player strike ceiling
  bossShardBonus: 120, // TUNE(elijah) — shards for clearing a zone boss
  defeatedHoldMs: 1200, // TUNE(elijah) — victory pause before returning to traversal
};

/** SFX/shake presets per story event. // TUNE(elijah). */
export const STORY_SENSORY: Partial<Record<StorySensoryEvent, SensoryEvent>> = {
  roll: { sfx: '/audio/sfx_ui_click.mp3', volume: 0.5 }, // TUNE(elijah)
  hop: { sfx: '/audio/sfx_basketball_swoosh.mp3', volume: 0.35 }, // TUNE(elijah)
  land: { sfx: '/audio/sfx_ui_click.mp3', volume: 0.4 }, // TUNE(elijah)
  bonus: { sfx: '/audio/sfx_score.mp3', volume: 0.6 }, // TUNE(elijah)
  carnival: { sfx: '/audio/sfx_score.mp3', volume: 0.7, shake: 0.05 }, // TUNE(elijah)
  obstacle: { sfx: '/audio/sfx_impact.mp3', volume: 0.6, shake: 0.12, rumbleMs: 120 }, // TUNE(elijah)
  bossEncounter: { sfx: '/audio/sfx_impact.mp3', volume: 0.8, shake: 0.18, rumbleMs: 200 }, // TUNE(elijah)
  strike: { sfx: '/audio/sfx_impact.mp3', volume: 0.7, shake: 0.1 }, // TUNE(elijah)
  bossDamage: { sfx: '/audio/sfx_impact.mp3', volume: 0.6, shake: 0.14, rumbleMs: 140 }, // TUNE(elijah)
  retreat: { sfx: '/audio/sfx_impact.mp3', volume: 0.9, shake: 0.22, rumbleMs: 260 }, // TUNE(elijah)
  bossDefeated: { sfx: '/audio/sfx_score.mp3', volume: 0.9, shake: 0.16 }, // TUNE(elijah)
  complete: { sfx: '/audio/sfx_score.mp3', volume: 1.0, shake: 0.2 }, // TUNE(elijah)
};
