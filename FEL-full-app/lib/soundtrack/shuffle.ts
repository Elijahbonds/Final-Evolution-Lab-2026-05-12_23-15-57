// lib/soundtrack/shuffle.ts — CREATOR SOUNDTRACK piece G: shuffle without repeats. Pure (the random source is injected).
//
// Every track plays once before any plays again (a "bag"); a featured track goes into the bag twice, but never twice in a
// row; the first track of a new bag is never the last one of the previous bag. A stage can narrow the pool by mood
// ('bed' under a game, 'menu' in menus) — when nothing matches, the whole catalogue plays.

import type { Mood } from '@/lib/creator/creative-card-review';
import type { SoundtrackTrack } from './types';

export type Rng = () => number;

export function moodPool(tracks: SoundtrackTrack[], mood: Mood | null): SoundtrackTrack[] {
  if (!mood) return tracks;
  const m = tracks.filter((t) => t.moods.includes(mood));
  return m.length ? m : tracks;
}

export class Shuffler {
  private bag: string[] = [];
  private last: string | null = null;
  constructor(private rng: Rng = Math.random) {}

  /** The next track id from `pool` (null when the pool is empty). */
  next(pool: SoundtrackTrack[]): string | null {
    if (!pool.length) return null;
    const ids = new Set(pool.map((t) => t.id));
    this.bag = this.bag.filter((id) => ids.has(id));   // the catalogue or the mood changed: drop what left the pool
    if (!this.bag.length) this.bag = this.fill(pool);
    let i = this.bag.findIndex((id) => id !== this.last);
    // Only a featured track's second copy can be left alone after its first: keep it, and draw from the next bag first.
    if (i < 0 && pool.length > 1) { this.bag = [...this.bag, ...this.fill(pool)]; i = this.bag.findIndex((id) => id !== this.last); }
    if (i < 0) i = 0;
    const [id] = this.bag.splice(Math.max(0, i), 1);
    this.last = id;
    return id;
  }

  private fill(pool: SoundtrackTrack[]): string[] {
    const ids = pool.flatMap((t) => (t.featured ? [t.id, t.id] : [t.id]));
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    // spread a featured pair: no id twice in a row inside the bag
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] === ids[i - 1]) {
        const k = ids.findIndex((x, n) => n > i && x !== ids[i]);
        if (k > 0) [ids[i], ids[k]] = [ids[k], ids[i]];
      }
    }
    return ids;
  }
}
