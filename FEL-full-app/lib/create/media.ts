// lib/create/media.ts — CREATE HUB (owner, 2026-10-06): getting a track ready to upload, in the browser, with no new
// dependency and no server transcoding (ffmpeg would be both). Pure: plain Float32Array channels in, bytes and numbers
// out. The Web Audio side (decode, offline render) is media-browser.ts.
//
// WHY THESE CHOICES
//   - Size. A 44.1 kHz stereo WAV is about 10 MB a minute, over the 8 MB cap (owner: "about 8 MB and 4 minutes") in
//     under a minute. A mix is re-encoded to 16-bit WAV at the richest rate that fits (chooseFormat). That is
//     the plan's fallback encoding (§2 piece E); phones play WAV everywhere, which MediaRecorder's webm/mp4 do not.
//   - Loudness. The soundtrack normalises every track toward about -16 LUFS (lane/soundtrack's player). This measures an
//     approximation: the mean square over 400 ms blocks, gated at -70 LUFS and then 10 dB under the ungated mean
//     (BS.1770's two gates), without the K-weighting filter. For full-range music it lands within a few dB of a real
//     meter, which is what a gain trim clamped to -12..+6 dB needs.
//   - Uploads a player brings keep their own bytes when they already fit (an mp3 is far smaller than any WAV we make).

export const UPLOAD_LIMITS = { bytes: 8 * 1024 * 1024, durationSec: 240 } as const;
export const MIX_RATE = 22_050;
/** The upload allowlist (lib/soundtrack/storage.ts MEDIA_MIME), audio half. */
export const UPLOADABLE_AUDIO = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm'] as const;

/** A file's MIME as the upload route names it: codec parameters dropped, the common aliases mapped, else null. */
export function uploadMime(type: string, fileName = ''): typeof UPLOADABLE_AUDIO[number] | null {
  const base = type.split(';')[0].trim().toLowerCase();
  const alias: Record<string, typeof UPLOADABLE_AUDIO[number]> = {
    'audio/mpeg': 'audio/mpeg', 'audio/mp3': 'audio/mpeg', 'audio/mp4': 'audio/mp4', 'audio/m4a': 'audio/x-m4a', 'audio/x-m4a': 'audio/x-m4a',
    'audio/aac': 'audio/mp4', 'audio/wav': 'audio/wav', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/webm': 'audio/webm',
  };
  if (alias[base]) return alias[base];
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return ({ mp3: 'audio/mpeg', m4a: 'audio/x-m4a', mp4: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm' } as const)[ext as 'mp3'] ?? null;
}

/** Why a track cannot be uploaded, in the player's words, or null when it can. */
export function trackProblem(t: { bytes: number; durationSec: number; peak?: number }): string | null {
  if (!(t.durationSec > 0)) return 'That file has no audio we can play.';
  if (t.durationSec > UPLOAD_LIMITS.durationSec) return 'Tracks can be up to 4 minutes.';
  if (t.durationSec < 1) return 'That is under a second long.';
  if (t.bytes > UPLOAD_LIMITS.bytes) return 'Tracks can be up to 8 MB.';
  if (t.peak !== undefined && t.peak < 1e-4) return 'That track is silent.';
  return null;
}

/** The loudest sample, 0..1. */
export function peakOf(channels: readonly Float32Array[]): number {
  let p = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > p) p = a; }
  return p;
}

/** Approximate integrated loudness in LUFS (see the header), or -70 for silence. */
export function measureLufs(channels: readonly Float32Array[], sampleRate: number): number {
  const len = channels[0]?.length ?? 0;
  const block = Math.max(1, Math.round(sampleRate * 0.4));
  const hop = Math.max(1, Math.round(block / 4));   // 75 % overlap, as BS.1770
  const powers: number[] = [];
  for (let start = 0; start + block <= len; start += hop) {
    let sum = 0;
    for (const ch of channels) for (let i = start; i < start + block; i++) sum += ch[i] * ch[i];
    powers.push(sum / block);   // channels summed, as BS.1770 (unit weights for L/R)
  }
  if (!powers.length && len > 0) {   // shorter than one block: one block of what there is
    let sum = 0; for (const ch of channels) for (let i = 0; i < len; i++) sum += ch[i] * ch[i];
    powers.push(sum / len);
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => p > 0 && lufs(p) > -70);
  if (!abs.length) return -70;
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const rel = lufs(mean(abs)) - 10;
  const gated = abs.filter((p) => lufs(p) > rel);
  const out = lufs(mean(gated.length ? gated : abs));
  return Math.max(-70, Math.min(0, Math.round(out * 10) / 10));
}

/** Linear resample of one channel. Good enough for a 2x down-step of a mix (it is followed by 16-bit quantising). */
export function resample(ch: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return ch;
  const n = Math.max(1, Math.round(ch.length * to / from));
  const out = new Float32Array(n);
  const ratio = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const a = Math.floor(x);
    const f = x - a;
    const s0 = ch[Math.min(a, ch.length - 1)];
    const s1 = ch[Math.min(a + 1, ch.length - 1)];
    out[i] = s0 + (s1 - s0) * f;
  }
  return out;
}

const wavSize = (sec: number, rate: number, ch: number) => 44 + Math.ceil(sec * rate) * ch * 2;

/**
 * The richest 16-bit WAV that fits the cap: 22.05 kHz stereo (up to about 95 s), then 22.05 kHz mono (about 190 s),
 * then 16 kHz mono (the full 4 minutes). Only a re-encode lands here: an mp3 or m4a that already fits keeps its bytes.
 */
export function chooseFormat(durationSec: number, inputChannels: number): { rate: number; channels: 1 | 2 } {
  if (inputChannels >= 2 && wavSize(durationSec, MIX_RATE, 2) <= UPLOAD_LIMITS.bytes) return { rate: MIX_RATE, channels: 2 };
  if (wavSize(durationSec, MIX_RATE, 1) <= UPLOAD_LIMITS.bytes) return { rate: MIX_RATE, channels: 1 };
  return { rate: 16_000, channels: 1 };
}

/** 16-bit PCM WAV bytes for these channels (already at `sampleRate`). */
export function wavBytes(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const numCh = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataLen = frames * numCh * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  let p = 0;
  const str = (s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(p++, s.charCodeAt(i)); };
  const u32 = (x: number) => { v.setUint32(p, x, true); p += 4; };
  const u16 = (x: number) => { v.setUint16(p, x, true); p += 2; };
  str('RIFF'); u32(36 + dataLen); str('WAVE');
  str('fmt '); u32(16); u16(1); u16(numCh); u32(sampleRate); u32(sampleRate * numCh * 2); u16(numCh * 2); u16(16);
  str('data'); u32(dataLen);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(p, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
      p += 2;
    }
  }
  return new Uint8Array(buf);
}

/** A mix, re-encoded for upload: 16-bit WAV at the richest format that fits (chooseFormat). */
export function encodeMixWav(channels: readonly Float32Array[], sampleRate: number): { bytes: Uint8Array; channels: 1 | 2; rate: number; durationSec: number } {
  const durationSec = (channels[0]?.length ?? 0) / sampleRate;
  const fmt = chooseFormat(durationSec, channels.length);
  let chans = channels.map((c) => resample(c, sampleRate, fmt.rate));
  if (fmt.channels === 1 && chans.length > 1) {
    const m = new Float32Array(chans[0].length);
    for (const c of chans) for (let i = 0; i < m.length; i++) m[i] += c[i] / chans.length;
    chans = [m];
  }
  return { bytes: wavBytes(chans.slice(0, fmt.channels), fmt.rate), channels: fmt.channels, rate: fmt.rate, durationSec };
}

/**
 * The beat maker's stems (each the same 2 bars) summed into one mix and repeated `times` over, so a 2-bar pattern
 * becomes a loop long enough to hear in a menu. Every stem is mixed at unity; the sum is soft-limited so a dense
 * pattern cannot clip.
 */
export function mixStemsLooped(stems: readonly (readonly Float32Array[])[], times: number): Float32Array[] {
  if (!stems.length) return [];
  const nCh = Math.max(...stems.map((s) => s.length));
  const len = Math.max(...stems.map((s) => s[0]?.length ?? 0));
  const once: Float32Array[] = Array.from({ length: nCh }, () => new Float32Array(len));
  for (const s of stems) for (let c = 0; c < nCh; c++) {
    const src = s[Math.min(c, s.length - 1)];
    for (let i = 0; i < src.length; i++) once[c][i] += src[i];
  }
  const reps = Math.max(1, Math.floor(times));
  return once.map((ch) => {
    const out = new Float32Array(ch.length * reps);
    for (let r = 0; r < reps; r++) out.set(ch, r * ch.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]);
    return out;
  });
}

/** Bars of a 4/4 song at this tempo that fit in `sec`. */
export const barsIn = (sec: number, bpm: number): number => Math.max(0, Math.floor(sec / (240 / bpm)));
/** How many bars to render an Academy loop at: about 30 s for menus, at least 8 bars, at most 32. */
export const academyBars = (bpm: number): number => Math.max(8, Math.min(32, 4 * Math.round(barsIn(30, bpm) / 4)));
