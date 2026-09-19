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
  crowd: true,          // L4 — Center Court has crowd tiers; give them people
  energy: true,         // Aces' gauge, Zone Shot and racket break
  cage: true,           // PARKOUR TENNIS (owner brief 2026-09-18): the glass cage, wall-run returns, the aerials, the rally multiplier
  // Phase 3 (2026-09-03): the authored forehand (lib/babylon/anim/authored/tennis.ts),
  // proven on the forge rig. It replaced the jumpshot stand-in.
  swingClip: 'tennis_swing',
  aiSkill: 0.82,  //TUNE(elijah)
  hudLabels: { you: 'YOUR POINT', them: 'THEIR POINT' },
});
