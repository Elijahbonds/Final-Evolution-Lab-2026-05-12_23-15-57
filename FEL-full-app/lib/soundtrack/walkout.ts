// lib/soundtrack/walkout.ts — CREATOR SOUNDTRACK piece K3: a walk-out source from the catalogue. Pure.
//
// DunkMode resolves its walk-out from the device's own StudioLibrary only (DunkMode.ts, improve-hoops / dunk-next hold it).
// This gives it a second source: a creator's approved track, credited. A URL string is synchronous to hand over, which is
// the constraint StudioLibrary.ts documents. The mount (routed to the Dunk lane) is:
//   const src = resolveWalkOutSource(catalogue.tracks, { preferId });   // null → keep today's local walk-out
//   if (src) { const release = claimMusicFocus('walkout'); play src.url through SoundKit.graph().music; release() after }

import type { SoundtrackTrack } from './types';

export interface WalkOutSource { trackId: string; url: string; title: string; creator: { name: string; href: string | null }; loop: SoundtrackTrack['loop'] }

/** The player's own pick if it is still in the catalogue; else a featured hype track; else any hype track; else null. */
export function resolveWalkOutSource(tracks: SoundtrackTrack[], opts: { preferId?: string | null; rng?: () => number } = {}): WalkOutSource | null {
  const pick = (t: SoundtrackTrack): WalkOutSource => ({ trackId: t.id, url: t.url, title: t.title, creator: t.creator, loop: t.loop });
  const preferred = opts.preferId ? tracks.find((t) => t.id === opts.preferId) : undefined;
  if (preferred) return pick(preferred);
  const hype = tracks.filter((t) => t.moods.includes('hype'));
  const featured = hype.filter((t) => t.featured);
  const pool = featured.length ? featured : hype;
  if (!pool.length) return null;
  const r = opts.rng ?? Math.random;
  return pick(pool[Math.floor(r() * pool.length) % pool.length]);
}
