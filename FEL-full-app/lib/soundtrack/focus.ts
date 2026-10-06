// lib/soundtrack/focus.ts — CREATOR SOUNDTRACK piece G: music focus. Modelled on lib/audio/session.ts's
// PlaybackSessionClaims: counted claims, each with a one-shot release.
//
// A room that plays its own music (the Cypher's band, the Academy, a Dunk walk-out, a mode that declares
// `soundtrack: 'own'`) claims focus while it plays; the soundtrack fades out behind it and comes back when the last claim
// is released. This NEVER touches the iOS audio session: the soundtrack plays on SoundKit's context like the game's other
// sounds, so the silent switch is respected (only the music rooms claim 'playback').

export class MusicFocus {
  private held = new Map<number, string>();
  private seq = 0;
  private listeners = new Set<() => void>();

  get count(): number { return this.held.size; }
  /** Who holds it (for the dock's "paused for …" line and for tests). */
  get holders(): string[] { return [...this.held.values()]; }

  /** Take focus; returns the release (a second call does nothing). */
  claim(who: string): () => void {
    const id = ++this.seq;
    this.held.set(id, who);
    this.emit();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.held.delete(id);
      this.emit();
    };
  }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(): void { for (const fn of [...this.listeners]) { try { fn(); } catch { /* one bad listener never blocks the rest */ } } }
}

export const musicFocus = new MusicFocus();

/** For a room that owns the music: `const release = claimMusicFocus('dance'); … release();` */
export const claimMusicFocus = (who: string): (() => void) => musicFocus.claim(who);
