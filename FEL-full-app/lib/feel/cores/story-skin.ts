/**
 * lib/feel/cores/story-skin.ts
 * ============================
 * M9 Step 17 — Story Mode skin for the Board/Story core.
 *
 * A mode is a thin skin: constants (story-constants.ts) + sensory presets.
 * This file wires those into a `StorySkin` the StoryCore can run. It adds NO
 * new behaviour to the core — Story Mode is just the archetype dressed with
 * numbers and the donor board data. All tunables live in story-constants.ts,
 * every value // TUNE(elijah).
 *
 * Reference: reference__StoryMode.js (roll -> hop around the board -> resolve
 * the landed space -> zone boss fights; defeat all four bosses to win).
 */

import { StoryCore, type StorySkin } from './story-core';
import { SensoryBus } from '../index';
import { STORY_TUNING, STORY_SENSORY } from './story-constants';

export interface StorySkinOpts {
  onSensory?: StorySkin['onSensory'];
  onPhase?: StorySkin['onPhase'];
  onSpace?: StorySkin['onSpace'];
  onBoss?: StorySkin['onBoss'];
  onComplete?: StorySkin['onComplete'];
}

/** Build the Story Mode StorySkin. */
export function makeStorySkin(opts: StorySkinOpts = {}): StorySkin {
  return {
    tuning: STORY_TUNING,
    sensory: STORY_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onSpace: opts.onSpace,
    onBoss: opts.onBoss,
    onComplete: opts.onComplete,
  };
}

/** Convenience constructor: a StoryCore already wearing the Story Mode skin. */
export function makeStoryRun(
  opts: StorySkinOpts & { bus?: SensoryBus; rng?: () => number } = {},
): StoryCore {
  const { bus, rng, ...skinOpts } = opts;
  return new StoryCore(makeStorySkin(skinOpts), { bus, rng });
}

export { STORY_TUNING, STORY_SENSORY } from './story-constants';
