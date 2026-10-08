// lib/soundtrack/playCount.ts — CREATOR SOUNDTRACK piece L: what counts as a play. Pure.
//
// A play is at least 30 seconds actually HEARD of one track (time while playing, audible and visible; a paused, muted or
// hidden track does not accrue), reported once per start of that track. The server then counts it at most once per
// listener, per track, per UTC day (app/api/v1/soundtrack/[id]/play). Plays are engagement shown as "plays", never a score
// or a ranking (the walk-out's own rule, lib/babylon/music/WalkOut.ts).

export const PLAY_THRESHOLD_SEC = 30;
/** One timeupdate can arrive late; never credit more than this per tick, so a stalled tab cannot leap past the line. */
export const MAX_TICK_SEC = 1.5;

export class PlayTracker {
  private trackId: string | null = null;
  private heard = 0;
  private reported = false;

  /** A new track started (or the same one restarted from the top). */
  start(trackId: string): void { this.trackId = trackId; this.heard = 0; this.reported = false; }

  /**
   * `dt` seconds passed while this track was playing. Returns the track id the moment it crosses the line (once per
   * start), else null.
   */
  tick(dt: number, audible: boolean): string | null {
    if (!this.trackId || this.reported || !audible || !(dt > 0)) return null;
    this.heard += Math.min(dt, MAX_TICK_SEC);
    if (this.heard >= PLAY_THRESHOLD_SEC) { this.reported = true; return this.trackId; }
    return null;
  }

  get heardSec(): number { return this.heard; }
}

/** Midnight UTC of `now`: the start of the dedupe window. */
export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** The listener a play is deduped against: the account, else the guest token, else nobody (not counted). */
export function listenerOf(userId: string | null | undefined, guestId: string | null | undefined):
  { userId: string } | { guestId: string } | null {
  if (userId) return { userId };
  if (guestId && /^[A-Za-z0-9_-]{8,200}$/.test(guestId)) return { guestId };
  return null;
}
