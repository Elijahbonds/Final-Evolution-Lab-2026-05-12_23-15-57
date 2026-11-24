/**
 * NATURE SOUNDS, generated in code (improve pass phase 5, lane/improve-world, 2026-11-22). The outdoor places (the story's hub and
 * Chapter 1, the Coast) had a noise bed and nothing alive in it. Three short synths, no files (the owner's sound rule, 2026-11-12:
 * free CC0 recordings or synthesised; nothing new to license):
 *
 *   chirp   a small bird: two to four quick rising sine sweeps (2.4 → 4 kHz), a few tens of milliseconds each
 *   gull    a gull's "kee-ow": a sawtooth that rises then falls through a band-pass, with a fast wobble
 *   wave    a wave washing up the sand: brown noise through a low-pass that opens and closes, a slow swell and a long hiss out
 *
 * They play into SoundKit's own SFX bus (SoundKit.graph().sfx), so the player's SFX level, the voice ducking, the output preset and
 * the mute (SoundKit.muted) apply to them exactly as to every SoundKit cue. Nothing plays before a context exists (a gesture).
 */

import { SoundKit } from './SoundKit';

export type NatureCue = 'chirp' | 'gull' | 'wave';
export interface NatureOpts { volume?: number; pitch?: number; pan?: number }

let noise: { ctx: BaseAudioContext; buf: AudioBuffer } | null = null;
/** One shared 2.5 s brown-noise buffer per context (a wave reuses it; the hit synths build theirs per call). */
function brown(ctx: AudioContext): AudioBuffer {
  if (noise && noise.ctx === ctx) return noise.buf;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2.5), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
  noise = { ctx, buf };
  return buf;
}

/** Play one nature cue. A no-op while muted, on the server, or before the game's audio context can exist. */
export function playNature(name: NatureCue, o: NatureOpts = {}): void {
  if (SoundKit.muted) return;
  const g0 = SoundKit.graph();
  if (!g0) return;
  const { ctx, sfx } = g0;
  const vol = Math.max(0, o.volume ?? 1), pitch = Math.max(0.25, Math.min(4, o.pitch ?? 1));
  if (vol <= 0) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  let tail: AudioNode = out;
  if (o.pan && Number.isFinite(o.pan) && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    tail = out.connect(p);
  }
  tail.connect(sfx);
  let end = t;
  if (name === 'chirp') {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.075 + Math.random() * 0.03);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2400 * pitch, s);
      osc.frequency.exponentialRampToValueAtTime(4000 * pitch, s + 0.045);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.09 * vol, s + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.05);
      osc.connect(g).connect(out);
      osc.start(s); osc.stop(s + 0.06);
      end = s + 0.06;
    }
  } else if (name === 'gull') {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(1500 * pitch, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(700 * pitch, t + 0.42);
    const wob = ctx.createOscillator();
    wob.frequency.value = 28;
    const wobG = ctx.createGain();
    wobG.gain.value = 40 * pitch;
    wob.connect(wobG).connect(osc.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.value = 1400 * pitch;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07 * vol, t + 0.05);
    g.gain.setValueAtTime(0.07 * vol, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    osc.connect(bp).connect(g).connect(out);
    osc.start(t); wob.start(t); osc.stop(t + 0.5); wob.stop(t + 0.5);
    end = t + 0.5;
  } else {
    // a wave: the swell in (0.7 s), the hiss up the sand and back out (about 2 s)
    const src = ctx.createBufferSource();
    src.buffer = brown(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(300 * pitch, t);
    lp.frequency.exponentialRampToValueAtTime(2200 * pitch, t + 0.8);
    lp.frequency.exponentialRampToValueAtTime(500 * pitch, t + 2.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    src.connect(lp).connect(g).connect(out);
    src.start(t); src.stop(t + 2.5);
    end = t + 2.5;
  }
  // let the graph go once the cue has rung out
  setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, Math.ceil((end - t) * 1000) + 200);
}
