/**
 * lib/feel/cores/irl-dunk-skin.ts
 * ===============================
 * M9 Step 18 — IRL Dunk skin for the IRL session core.
 *
 * A mode is a thin skin: constants (irl-dunk-constants.ts) + sensory presets.
 * This file wires those into an `IrlSessionSkin` the IrlSessionCore can run. It
 * adds NO new behaviour — IRL Dunk is the archetype dressed with numbers and a
 * mode key. All tunables live in irl-dunk-constants.ts, every value
 * // TUNE(elijah).
 *
 * The actual DUNK feel comes from the Court core (family #1); this skin governs
 * only the local session: Mirror Triumph, couch H2H, and the review bridge.
 *
 * Reference: LINEUP_SPEC §IRL — "IRL Dunk: local-only runs, Mirror Triumph,
 * couch H2H, review bridge (metadata-only submissions to your competition API
 * when configured)."
 */

import { IrlSessionCore, type IrlSessionSkin, type IrlMirror } from './irl-session-core';
import { SensoryBus } from '../index';
import { IRL_DUNK_MODE, IRL_DUNK_TUNING, IRL_DUNK_SENSORY } from './irl-dunk-constants';

export interface IrlDunkSkinOpts {
  /** True once a competition endpoint exists; enables the review bridge. */
  submissionConfigured?: boolean;
  onSensory?: IrlSessionSkin['onSensory'];
  onPhase?: IrlSessionSkin['onPhase'];
}

/** Build the IRL Dunk IrlSessionSkin. */
export function makeIrlDunkSkin(opts: IrlDunkSkinOpts = {}): IrlSessionSkin {
  return {
    mode: IRL_DUNK_MODE,
    tuning: IRL_DUNK_TUNING,
    submissionConfigured: opts.submissionConfigured ?? false,
    sensory: IRL_DUNK_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
  };
}

/** Convenience constructor: an IrlSessionCore already wearing the IRL Dunk skin. */
export function makeIrlDunkSession(
  opts: IrlDunkSkinOpts & {
    bus?: SensoryBus;
    now?: () => number;
    mirror?: Partial<IrlMirror>;
  } = {},
): IrlSessionCore {
  const { bus, now, mirror, ...skinOpts } = opts;
  return new IrlSessionCore(makeIrlDunkSkin(skinOpts), { bus, now, mirror });
}

export { IRL_DUNK_MODE, IRL_DUNK_TUNING, IRL_DUNK_SENSORY } from './irl-dunk-constants';
