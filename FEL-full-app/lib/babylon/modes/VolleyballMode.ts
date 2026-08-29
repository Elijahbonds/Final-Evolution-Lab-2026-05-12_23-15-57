// VolleyballMode — three touches per side, rally scoring to 25 (win by 2,
// hard cap 30), a much higher net.
//
// Same engine as tennis. The differences that matter are all in RallyCore's
// VOLLEYBALL config: netHeight 2.24 vs 0.95 is what makes weak contact get
// dug into the tape instead of floated over, and touchesPerSide 3 is what
// turns a rally into a sequence rather than an exchange.

import { createNetSportMode } from './NetSportMode';
import { VOLLEYBALL } from '../core/RallyCore';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

export const VolleyballMode = createNetSportMode({
  modeId: 'volleyball',
  venueId: 'volleyball',
  heroUrl: SHARED_CFG.heroUrl,
  cfg: VOLLEYBALL,
  scoring: 'volley',
  ballDiameter: 0.21,
  ballTint: '#FFD60A',
  ambient: 'stadium',     // mapped from 'beach' — SoundKit only accepts 'stadium'|'dojo'|'none'
  swingClip: 'jumpshot',
  aiSkill: 0.78,  //TUNE(elijah)
  hudLabels: { you: 'POINT', them: 'POINT THEM' },
});
