// lib/soundtrack/tracksBlock.ts — CREATOR SOUNDTRACK piece L: the rows of a creator card's "Tracks" block. Pure.
// (components/soundtrack/creator-tracks.tsx reads the database and renders these.)

export interface TrackRowLike { id: string; title: string; art: unknown; stats: unknown }
export interface TrackItem { id: string; title: string; plays: number; inRotation: boolean; durationLabel: string | null }

export function durationLabel(sec: number | null | undefined): string | null {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function tracksBlock(rows: TrackRowLike[], deps: {
  readMusic: (art: unknown) => { durationSec: number } | null;
  readPlays: (stats: unknown) => number;
  readRotation: (stats: unknown) => string | null;
}): TrackItem[] {
  return rows.map((r) => {
    const rot = deps.readRotation(r.stats);
    return {
      id: r.id, title: r.title.slice(0, 80), plays: deps.readPlays(r.stats),
      inRotation: rot === 'on' || rot === 'featured',
      durationLabel: durationLabel(deps.readMusic(r.art)?.durationSec),
    };
  });
}
