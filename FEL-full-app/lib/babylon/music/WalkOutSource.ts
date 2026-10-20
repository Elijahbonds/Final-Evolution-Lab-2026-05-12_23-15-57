// WalkOutSource — PIPELINES (owner, 2026-10-06): the Dunk walk-out, from the player's own song OR the soundtrack, on
// the MUSIC bus.
//
// Before: DunkMode played its walk-out with `new Audio(src)` at volume 0.45, straight to the speakers — past SoundKit's
// buses, so the music slider never reached it, the MC's voice duck could not lower it, and the menu soundtrack could play
// on top. And it had one source only, the device's StudioLibrary: a player with no Academy song walked out to silence.
//
// Now, one small object the mode holds:
//   prepare(cue, onCredit)  at load: no local walk-out (cue null) → read the soundtrack catalogue and pick a hype track
//                           (lane/soundtrack's resolveWalkOutSource: featured first), and hand back its credit line
//                           ("WALK-OUT · <title> · <creator>") for the HUD. A local cue needs nothing.
//   start(cue, onStarted)   plays the local cue's song, else the prepared catalogue track, LOOPED, through
//                           playOnMusicBus at −7 dB (the old 0.45), claiming music focus so the soundtrack fades out
//                           behind it. `onStarted` fires only when audio actually started (the play counter's rule).
//   stop()                  stops it and releases focus.
// No Web Audio, an autoplay refusal or no catalogue: nothing plays, exactly as before an Academy song was chosen.

import type { WalkOutCue } from './WalkOutCue';
import type { SoundtrackTrack } from '@/lib/soundtrack/types';
import type { MusicBusClip } from '@/lib/soundtrack/musicBusPlayer';
import { resolveWalkOutSource, type WalkOutSource } from '@/lib/soundtrack/walkout';

/** −7 dB on the music bus ≈ the old element volume 0.45 (lane/soundtrack's assumption, kept). */
export const WALKOUT_GAIN_DB = -7;

export interface WalkOutDeps {
  playOnBus?: (url: string, opts: { gainDb?: number; loop?: boolean; who?: string }) => Promise<MusicBusClip | null>;
  fetchCatalogue?: () => Promise<SoundtrackTrack[]>;
}

async function defaultFetchCatalogue(): Promise<SoundtrackTrack[]> {
  if (typeof fetch !== 'function') return [];
  try {
    // FIRST-DUNK-BUDGET (2026-10-17): the page's one catalogue read, shared with the soundtrack dock (each fetched it on every /try run)
    const { fetchSoundtrackTracks } = await import('@/lib/soundtrack/client');
    return (await fetchSoundtrackTracks()) ?? [];
  } catch { return []; }
}

async function defaultPlayOnBus(url: string, opts: { gainDb?: number; loop?: boolean; who?: string }): Promise<MusicBusClip | null> {
  try {
    const { playOnMusicBus } = await import('@/lib/soundtrack/musicBusPlayer');
    // FIRST-DUNK-BUDGET: a catalogue track comes through the soundtrack's device cache, so the walk-out and the soundtrack's deck
    // share one download of it (a local song is a data URL already: it plays as it is)
    let src = url;
    if (/^(\/|https?:)/.test(url)) {
      const { SoundKit } = await import('@/lib/babylon/audio/SoundKit');
      if (!SoundKit.graph()) return null;   // nothing could play it: fetch nothing (playOnMusicBus answers null here too)
      const [{ cachedSrc }, { saveDataOn }] = await Promise.all([import('@/lib/soundtrack/cache'), import('@/lib/soundtrack/client')]);
      src = await cachedSrc(url, { saveData: saveDataOn() });
    }
    return await playOnMusicBus(src, opts);
  } catch { return null; }
}

/** The HUD line for a catalogue walk-out: the title and the creator, as the soundtrack credits them. */
export const walkOutSourceLine = (s: WalkOutSource | null): string => (s ? `WALK-OUT · ${s.title} · ${s.creator.name}` : '');

export class WalkOutPlayer {
  private clip: MusicBusClip | null = null;
  private source: WalkOutSource | null = null;
  private starting = false;
  private wantStop = false;

  constructor(private deps: WalkOutDeps = {}) {}

  /** The catalogue track this night will walk out to, when there is no local song. */
  get catalogueSource(): WalkOutSource | null { return this.source; }

  prepare(cue: WalkOutCue | null, onCredit?: (line: string) => void): Promise<void> {
    this.source = null;
    if (cue) return Promise.resolve();
    return (this.deps.fetchCatalogue ?? defaultFetchCatalogue)().then((tracks) => {
      this.source = resolveWalkOutSource(tracks);
      if (this.source) onCredit?.(walkOutSourceLine(this.source));
    }).catch(() => { this.source = null; });
  }

  start(cue: WalkOutCue | null, onStarted?: () => void): void {
    if (this.clip || this.starting) return;
    const url = cue?.src || this.source?.url;
    if (!url) return;
    this.starting = true;
    this.wantStop = false;
    void (this.deps.playOnBus ?? defaultPlayOnBus)(url, { gainDb: WALKOUT_GAIN_DB, loop: true, who: 'walkout' }).then((clip) => {
      this.starting = false;
      if (!clip) return;                                 // autoplay refused / no Web Audio: the contest is not worse for it
      if (this.wantStop) { clip.stop(); return; }        // stopped while it was starting
      this.clip = clip;
      onStarted?.();
    }).catch(() => { this.starting = false; });
  }

  stop(): void {
    this.wantStop = true;
    if (this.clip) { try { this.clip.stop(); } catch { /* gone */ } this.clip = null; }
  }

  get playing(): boolean { return !!this.clip; }
}
