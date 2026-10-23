// TennisMode — one touch per side, deuce/advantage scoring, first to 4 games.
//
// Everything mechanical lives in NetSportMode + RallyCore. This file is the
// config, and that is the point: adding a net sport should cost a config, not
// a rewrite.

import { createNetSportMode, type NetSportOptions } from './NetSportMode';
import { TENNIS } from '../core/RallyCore';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

const TENNIS_OPTIONS: NetSportOptions = {
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
};

export const TennisMode = createNetSportMode(TENNIS_OPTIONS);

/**
 * tennis_tiebreak — TENNIS-TIEBREAK-FOLD (ALL-MODES-TO-75 §1 + S6, 2026-10-22; Elijah: "Fold Tiebreak into Tennis").
 * The Tennis tiebreak variant: the same court, venue, glass cage, swing clip and opponent, scored as a tiebreak — first to
 * 7 points, win by 2 (RallyCore.TiebreakScore). /play/tennis?variant=tiebreak plays it; /play/tiebreak redirects there.
 *
 * modeId 'tiebreak', not 'tennis_tiebreak', so every table keyed by that id (the body profile, the clip scope, the place
 * mood, the kit, the controls, the score rule its sessions post under) serves it. It is NOT in the registry map: the
 * route mounts it as the timing host's `def` (as /play/baseball does). MODES.tiebreak still names the old TiebreakMode,
 * now unrouted, because existing tests pin that entry (scripts/party-quiz-w6-tests.ts, lib/ui/controlsScreen.scan.test.ts,
 * lib/babylon/anim/clipScope.test.ts, and the body-row / drift checks); moving the key over waits on those test edits.
 *
 * No energy layer: the racket break is a match-length economy (3 rackets) and a 7-point tiebreak has no room for it; the
 * old Tiebreak Blitz had none either. assumption: the cage stays (the tip names it).
 */
export const TennisTiebreakMode = createNetSportMode({
  ...TENNIS_OPTIONS,
  modeId: 'tiebreak',
  scoring: 'tiebreak',
  energy: false,
});
