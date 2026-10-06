// lib/soundtrack/musicBusPlayer.ts — CREATOR SOUNDTRACK phase 4 hook (piece K3): play one clip on the MUSIC bus.
//
// The Dunk walk-out plays `new Audio(src)` at volume 0.45 straight to the speakers (DunkMode.ts, held by the Dunk lane):
// past SoundKit's buses, so the player's music volume does not reach it, voiceover's duck cannot lower it under the MC,
// and the menu soundtrack would play on top of it. This is the routed replacement, one call:
//     const clip = await playOnMusicBus(src, { gainDb: -7, who: 'walkout' });   // −7 dB ≈ the old 0.45
//     … clip?.stop();
// It claims music focus for as long as it plays (the soundtrack fades out behind it) and releases it on stop or end.
// Returns null where there is no Web Audio, so the caller keeps its old path.

import { claimMusicFocus } from './focus';
import { dbToGain } from './gain';

export interface MusicBusClip { stop(): void; readonly element: HTMLAudioElement }

export interface MusicBusDeps {
  graph?: () => Promise<{ ctx: AudioContext; music: AudioNode } | null>;
  createAudio?: () => HTMLAudioElement;
}

async function soundKitGraph(): Promise<{ ctx: AudioContext; music: AudioNode } | null> {
  try {
    const { SoundKit } = await import('@/lib/babylon/audio/SoundKit');
    const g = SoundKit.graph();
    return g ? { ctx: g.ctx, music: g.music } : null;
  } catch { return null; }
}

export async function playOnMusicBus(
  url: string, opts: { gainDb?: number; loop?: boolean; who?: string } = {}, deps: MusicBusDeps = {},
): Promise<MusicBusClip | null> {
  const g = await (deps.graph ?? soundKitGraph)();
  if (!g) return null;
  const el = (deps.createAudio ?? (() => new Audio()))();
  el.crossOrigin = 'anonymous';
  el.loop = !!opts.loop;
  el.src = url;
  const gain = g.ctx.createGain();
  gain.gain.value = dbToGain(opts.gainDb ?? 0);
  g.ctx.createMediaElementSource(el).connect(gain).connect(g.music);
  const release = claimMusicFocus(opts.who ?? 'clip');
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { el.pause(); } catch { /* gone */ }
    try { gain.disconnect(); } catch { /* gone */ }
    release();
  };
  el.addEventListener('ended', stop);
  el.addEventListener('error', stop);
  try { await el.play(); } catch { stop(); return null; }
  return { stop, element: el };
}
