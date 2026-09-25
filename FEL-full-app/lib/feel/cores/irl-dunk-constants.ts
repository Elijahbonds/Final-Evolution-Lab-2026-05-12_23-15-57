/**
 * lib/feel/cores/irl-dunk-constants.ts
 * ====================================
 * M9 Step 18 — IRL Dunk skin tunables for the IRL session core.
 *
 * IRL Dunk's identity (LINEUP_SPEC §IRL): the dunk feel is the Court core's
 * (family #1, already shipped) — IRL Dunk adds the LOCAL session layer:
 * local-only runs, Mirror Triumph (beat your own ghost), couch H2H, and a
 * review bridge that submits METADATA ONLY to your competition API when one is
 * configured. All values here are session knobs, every one // TUNE(elijah).
 *
 * An IRL mode is a thin IrlSessionSkin: these constants + sensory presets.
 * Adding it never edits the shared IrlSessionCore or any feel core.
 */

import type { IrlSessionTuning, IrlSensoryEvent } from './irl-session-core';
import type { SensoryEvent } from '../index';

/** Mode key used for Mirror Triumph lookups + review-bridge submissions. */
export const IRL_DUNK_MODE = 'irlDunk';

/** IRL Dunk session feel. Every number // TUNE(elijah). */
export const IRL_DUNK_TUNING: IrlSessionTuning = {
  h2hDefaultPlayers: 2, // TUNE(elijah) — couch H2H is 1v1 by default
  tieGoesTo: null, // TUNE(elijah) — a tie is a draw (no winner)
};

/**
 * Shake / hit-stop / rumble presets per IRL session event. // TUNE(elijah).
 * HOTFIX (2026-09-24): no `sfx` here. Every entry named an /audio/sfx_*.mp3 that was never under public/, so the
 * bus played silence. Sound belongs to the host that renders the mode (the Babylon modes play synthesized SoundKit
 * cues); no live host builds this core today. See lib/feel/sensory-bus.ts.
 */
export const IRL_DUNK_SENSORY: Partial<Record<IrlSensoryEvent, SensoryEvent>> = {
  newRecord: { shake: 0.14 }, // TUNE(elijah)
  h2hWin: { shake: 0.12 }, // TUNE(elijah)
};
