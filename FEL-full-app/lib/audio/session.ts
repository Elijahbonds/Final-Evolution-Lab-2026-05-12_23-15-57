// lib/audio/session.ts — the page's audio session TYPE, claimed by the rooms that are music and given back when they go.
//
// MUSIC-SUITE P2 FIX PASS (2026-09-25). Phase 2 set `navigator.audioSession.type = 'playback'` inside SoundKit.ensure()
// (SoundKit.ts:62 then), which runs the first time ANY Babylon mode builds SoundKit's context — every GameShell mode, the
// hoops, the dojo, the courts. On iOS Safari 17+ 'playback' plays through the ring/silent switch and does not mix with
// other apps (assumption, from the Audio Session API's description; not tried on a device here), so a player's own
// Spotify stopped the moment any FEL sound effect played, and a phone on silent played every mode — a process-wide
// change the plan only asked for in the music suite. And it never reached the rooms that most need it: the Groove Academy
// builds its OWN context (AudioEngine.ts `new AudioContext()`), and so does /play/calibrate, so on a silenced iPhone a
// player who opened either before any Babylon mode heard nothing — and a calibration run on a silent click saves a
// random offset that both rooms now apply.
//
// So the session is CLAIMED, not set: a room that is music (the Cypher, the Academy's engine, the legacy /create maker,
// the calibration screen) claims 'playback' before it makes a sound and releases the claim when it goes; the last release
// puts back whatever the type was before the first claim. Every other mode never touches it. Guarded throughout: only
// Safari has the API, and a refusal must never cost the audio.

/** The slice of `navigator` this reads: Safari 17's Audio Session API (`navigator.audioSession.type`). */
export type AudioSessionNavigator = { audioSession?: { type?: string } } | null | undefined;

/** What the music rooms ask for: play like a music app (through the silent switch, the phone's media volume). */
export const PLAYBACK_SESSION_TYPE = 'playback';

function defaultNavigator(): AudioSessionNavigator {
  return typeof navigator !== 'undefined' ? (navigator as unknown as AudioSessionNavigator) : null;
}

/**
 * Counted claims on the session type. One per page in the app (`playbackSession` below); the tests make their own.
 * Pure bookkeeping around one property write, so it runs in node against a fake navigator.
 */
export class PlaybackSessionClaims {
  private held = 0;
  /** The type before the first claim, put back by the last release. */
  private before: string | undefined;

  /** Claims currently held (for tests and probes). */
  get count(): number { return this.held; }

  /**
   * Ask for 'playback'. Returns the release: call it once when the room goes (a second call does nothing). Where the API
   * is missing or refuses, the claim is a no-op and so is its release.
   */
  claim(nav: AudioSessionNavigator = defaultNavigator()): () => void {
    let counted = false;
    try {
      const s = nav?.audioSession;
      if (s) {
        if (this.held === 0) this.before = s.type;
        this.held++;
        counted = true;
        if (s.type !== PLAYBACK_SESSION_TYPE) s.type = PLAYBACK_SESSION_TYPE;
      }
    } catch { /* not supported, or refused: the default session still plays */ }
    let released = false;
    return () => {
      if (released || !counted) return;
      released = true;
      this.held = Math.max(0, this.held - 1);
      if (this.held > 0) return;
      try {
        const s = nav?.audioSession;
        if (s && s.type === PLAYBACK_SESSION_TYPE) s.type = this.before ?? 'auto';
      } catch { /* the page keeps 'playback' until it goes: harmless */ }
      this.before = undefined;
    };
  }
}

/** The page's claims. */
export const playbackSession = new PlaybackSessionClaims();

/** Claim 'playback' for a music room; returns the release. */
export function claimPlaybackSession(nav?: AudioSessionNavigator): () => void {
  return playbackSession.claim(nav ?? defaultNavigator());
}
