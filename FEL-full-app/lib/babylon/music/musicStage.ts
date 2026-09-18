/**
 * lib/babylon/music/musicStage.ts
 *
 * MUSIC IS BOTH (owner, 2026-09-16: "Music mode is both. Maybe switch it at the
 * start up screen like we do with the other modes").
 *
 * The Academy is a creative tool AND a scored mode, and which one you get is a
 * pick on the boot splash — the same ritual as the court location, the board
 * venue and the race map, so there is one screen that covers what you are about
 * to do. Unlike those it needs no reload: the stage is only the tab StudioMode
 * opens on, and the mode reads the pick when it mounts.
 *
 *   studio  — build beats, flip, publish. No score, no session, no end card.
 *   perform — play the chart you built. Scored, and it reports a run.
 */

export const MUSIC_STAGE_IDS = ['studio', 'perform'] as const;
export type MusicStageId = (typeof MUSIC_STAGE_IDS)[number];

export interface MusicStage {
  id: MusicStageId;
  label: string;
  /** One line under the picker, the way the venue rows describe themselves. */
  sub: string;
  tint: string;
  ready: boolean;
}

export const MUSIC_STAGES: Record<MusicStageId, MusicStage> = {
  studio: {
    id: 'studio', label: 'STUDIO', tint: '#00E5FF', ready: true,
    sub: 'Build the beat. No clock, no score — the room is yours.',
  },
  perform: {
    id: 'perform', label: 'PERFORM', tint: '#FF2D95', ready: true,
    sub: 'Play your chart for a score. Ends on a card like any other mode.',
  },
};

export function isMusicStageId(v: unknown): v is MusicStageId {
  return typeof v === 'string' && (MUSIC_STAGE_IDS as readonly string[]).includes(v);
}

/** Stages the picker offers. */
export function readyMusicStages(): MusicStage[] {
  return MUSIC_STAGE_IDS.map((id) => MUSIC_STAGES[id]).filter((s) => s.ready);
}

export const MUSIC_STAGE_KEY = 'fel-music-stage';

/** The player's pick: `?stage=` wins, then the remembered pick, then the studio. */
export function readMusicStage(): MusicStageId {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('stage');
      if (isMusicStageId(q) && MUSIC_STAGES[q].ready) return q;
      const s = window.localStorage.getItem(MUSIC_STAGE_KEY);
      if (isMusicStageId(s) && MUSIC_STAGES[s].ready) return s;
    }
  } catch { /* private mode: the studio */ }
  return 'studio';
}

export function writeMusicStage(id: MusicStageId): void {
  try { window.localStorage.setItem(MUSIC_STAGE_KEY, id); } catch { /* convenience only */ }
}
