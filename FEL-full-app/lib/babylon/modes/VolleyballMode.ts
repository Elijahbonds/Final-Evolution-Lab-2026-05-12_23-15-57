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
  // 'ocean', not 'stadium'. The comment here said SoundKit only accepts
  // 'stadium' | 'dojo' | 'none' and that has not been true for some time — it
  // takes 'ocean' and 'wind' as well, and surf already uses the ocean bed. A
  // crowd loop on an empty beach court was the wrong room entirely.
  ambient: 'ocean',
  crowd: true,          // L4 — a Beach Pro court is not empty
  beach: true,          // ARENA-10PHASE P5 — sand to the horizon, the sea past the far baseline, the props on ground
  swingClip: 'volleyball_spike',   // Phase 3 (2026-09-03): authored spike, was the jumpshot
  aiSkill: 0.78,  //TUNE(elijah)
  hudLabels: { you: 'POINT', them: 'POINT THEM' },
});
