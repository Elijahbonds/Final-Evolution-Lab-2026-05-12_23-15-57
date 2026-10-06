// lib/soundtrack/client.ts — CREATOR SOUNDTRACK: the page's one player, and the small API other lanes mount.
//
// One line each, from the files their lanes hold (routed, never edited here):
//   boot-splash.tsx      setSoundtrackStage(props.phase)         every mode host's phase → loading / bed / end
//   ModeHarness.ts       enterBed() in firstInput(), exitBed() on teardown   (or a mode's `soundtrack: 'own'` → claimMusicFocus)
//   DanceMode / Academy  const release = claimMusicFocus('dance'); … release();
//   end-screen sideCards <NowPlayingCard />                      (components/soundtrack/now-playing-card.tsx)
//   DunkMode walk-out    resolveWalkOutSource(…) then playOnMusicBus(src.url, { gainDb: -7, who: 'walkout' })
//   boot-splash (hook)   useSoundtrackStage(props.phase)        (components/soundtrack/soundtrack-stage.tsx)
// Every export is a safe no-op on the server and before the dock has mounted.

import { SoundtrackPlayer, type PlayerEnv } from './player';
import { musicFocus, claimMusicFocus } from './focus';
import { stageForPhase } from './policy';
import { cachedSrc } from './cache';
import type { SoundtrackStage } from './types';

export { claimMusicFocus };
/** The Dunk walk-out's catalogue source (routed: the Dunk lane mounts it). */
export { resolveWalkOutSource } from './walkout';
/** A clip (the walk-out) on the music bus, holding focus while it plays. */
export { playOnMusicBus } from './musicBusPlayer';

const PREFS_KEY = 'fel-soundtrack-prefs';
type SoundKitLike = { unlock(): void; graph(): { ctx: AudioContext; music: GainNode } | null };
let kit: SoundKitLike | null = null;
let kitLoad: Promise<SoundKitLike | null> | null = null;
let player: SoundtrackPlayer | null = null;

/** Load SoundKit ahead of the first tap (the tap must unlock its context synchronously). */
export function preloadSoundKit(): Promise<SoundKitLike | null> {
  kitLoad ??= import('@/lib/babylon/audio/SoundKit').then((m) => (kit = m.SoundKit as unknown as SoundKitLike)).catch(() => null);
  return kitLoad;
}

/** A 1 ms silent WAV: what the decks play inside the first gesture so iOS lets them play from script afterwards. */
export function silentWavDataUri(): string {
  const samples = 44, bytes = new Uint8Array(44 + samples * 2), v = new DataView(bytes.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true);
  v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples * 2, true);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function browserEnv(): PlayerEnv {
  return {
    createAudio: () => new Audio(),
    graph: async () => {
      const k = kit ?? await preloadSoundKit();
      if (!k) return null;
      k.unlock();
      const g = k.graph();
      return g ? { ctx: g.ctx, music: g.music } : null;
    },
    now: () => performance.now(),
    resolveSrc: (url) => cachedSrc(url, { saveData: saveDataOn() }),
    reportPlay: (trackId, heardSec) => {
      try {
        void fetch(`/api/v1/soundtrack/${encodeURIComponent(trackId)}/play`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ heardSec }), keepalive: true,
        }).catch(() => {});
      } catch { /* a play that is not counted is not an error */ }
    },
    loadPrefs: () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'); } catch { return {}; } },
    savePrefs: (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* lasts the session */ } },
  };
}

export function saveDataOn(): boolean {
  try { return (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData === true; } catch { return false; }
}

/** The page's player (created on first ask, in the browser only). */
export function getSoundtrackPlayer(): SoundtrackPlayer | null {
  if (typeof window === 'undefined') return null;
  if (!player) {
    player = new SoundtrackPlayer(browserEnv());
    player.setFocusHeld(musicFocus.count > 0);
    musicFocus.subscribe(() => player?.setFocusHeld(musicFocus.count > 0));
  }
  return player;
}

/** The first tap: unlock SoundKit's context and the decks inside the gesture, then let the soundtrack start. */
export function unlockSoundtrackFromGesture(): void {
  const p = getSoundtrackPlayer();
  if (!p) return;
  try { kit?.unlock(); } catch { /* the harness unlocks it on a game's first input anyway */ }
  p.primeFromGesture(silentWavDataUri());
}

/** A host's phase ('loading' | 'ready' | 'playing' | 'ended' | …) or a stage; null hands the stage back to the page. */
export function setSoundtrackStage(phaseOrStage: string | null): void {
  const p = getSoundtrackPlayer();
  if (!p) return;
  if (phaseOrStage === null) { p.requestStage(null); return; }
  const stages: SoundtrackStage[] = ['menu', 'loading', 'bed', 'end', 'off'];
  p.requestStage((stages as string[]).includes(phaseOrStage) ? phaseOrStage as SoundtrackStage : stageForPhase(phaseOrStage));
}

/** In-game bed: the harness calls this on a mode's first input… */
export const enterBed = (): void => setSoundtrackStage('bed');
/** …and this on teardown. */
export const exitBed = (): void => setSoundtrackStage(null);
