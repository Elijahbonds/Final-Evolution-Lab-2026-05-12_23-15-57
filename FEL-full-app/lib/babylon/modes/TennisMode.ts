// TennisMode — one touch per side, deuce/advantage scoring, first to 4 games.
//
// Everything mechanical lives in NetSportMode + RallyCore. This file is the
// config, and that is the point: adding a net sport should cost a config, not
// a rewrite.

import { createNetSportMode } from './NetSportMode';
import { TENNIS } from '../core/RallyCore';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

export const TennisMode = createNetSportMode({
  modeId: 'tennis',
  venueId: 'tennis',
  heroUrl: SHARED_CFG.heroUrl,
  cfg: TENNIS,
  scoring: 'tennis',
  ballDiameter: 0.14,
  ballTint: '#D4FF00',
  ambient: 'stadium',
  // Reuses the authored jumpshot swing: an overhead racquet motion and a
  // jumper share the same arm arc closely enough to read correctly, and it
  // beats shipping a mode with no swing animation at all. Replace with an
  // authored `tennis_swing` clip when one exists.
  swingClip: 'jumpshot',
  aiSkill: 0.82,  //TUNE(elijah)
  hudLabels: { you: 'YOUR POINT', them: 'THEIR POINT' },
});
