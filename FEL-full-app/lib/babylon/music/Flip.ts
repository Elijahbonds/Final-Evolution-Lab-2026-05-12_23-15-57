// The Flip (SPEC-PASSION-PIPELINES lane 2 M1) — chop a source into pads the way a producer flips a record on an MPC:
// a 4×4 pad grid, slices found on transients (or a plain grid), pitch/reverse per pad, taps recorded into the groovebox.
//
// SOURCES ARE THE RULE, not the feature: FEL's own kit stems, the player's own recordings, and public-domain recordings
// with a documented rationale (the Free-Use Legends model). Never third-party catalogue audio — the reel that inspired
// this flipped a copyrighted theme; FEL's version flips what FEL is allowed to flip. The pure parts are tested.

export type SourceKind = 'fel' | 'own' | 'public-domain';
export interface FlipSource { id: string; label: string; url?: string; kind: SourceKind; note: string }
export const ALLOWED_SOURCE_KINDS: SourceKind[] = ['fel', 'own', 'public-domain'];
export function isAllowedSource(kind: unknown): kind is SourceKind { return typeof kind === 'string' && (ALLOWED_SOURCE_KINDS as string[]).includes(kind); }

/** FEL's own stems shipped in public/audio/kits/808 — the first flip library. Public-domain entries join with a written note. */
export const FEL_SOURCES: FlipSource[] = ['kick', 'snare', 'hat', 'openhat', 'clap', 'bass', 'lead', 'fx'].map((n) => ({
  id: `fel_808_${n}`, label: `808 ${n}`, url: `/audio/kits/808/${n}.wav`, kind: 'fel', note: "FEL's own 808 kit stem — first-party audio.",
}));

export interface Slice { start: number; end: number }
export const PAD_COUNT = 16;
export interface Pad { slice: Slice | null; pitch: number; reverse: boolean; gate: boolean }
/** Keyboard layout for the 16 pads, left-to-right / top-to-bottom: the number row, then q-row, a-row, z-row. */
export const PAD_KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
export function padForKey(key: string): number { const i = PAD_KEYS.indexOf(key.toLowerCase()); return i; }

/** Equal slices over [0, length). */
export function gridSlices(length: number, count: number): Slice[] {
  const n = Math.max(1, Math.min(PAD_COUNT, Math.floor(count)));
  if (length <= 0) return [];
  const step = length / n;
  return Array.from({ length: n }, (_, i) => ({ start: Math.floor(i * step), end: i === n - 1 ? length : Math.floor((i + 1) * step) }));
}

/** RMS energy per window (mono samples). */
export function energyEnvelope(samples: Float32Array, windowSize: number): Float32Array {
  const n = Math.max(1, Math.floor(samples.length / windowSize));
  const out = new Float32Array(n);
  for (let w = 0; w < n; w++) {
    let acc = 0; const base = w * windowSize;
    for (let i = 0; i < windowSize; i++) { const v = samples[base + i] ?? 0; acc += v * v; }
    out[w] = Math.sqrt(acc / windowSize);
  }
  return out;
}

/**
 * Transient slicing: an onset is a window whose energy jumps above `ratio` × the recent floor and above an absolute gate,
 * at least `minGapMs` after the previous onset. Fewer than two onsets → grid slices (a steady tone still gets pads).
 */
export function onsetSlices(samples: Float32Array, sampleRate: number, opts: { maxSlices?: number; windowMs?: number; minGapMs?: number; ratio?: number; gate?: number } = {}): Slice[] {
  const maxSlices = Math.min(PAD_COUNT, opts.maxSlices ?? PAD_COUNT);
  const windowSize = Math.max(16, Math.floor(sampleRate * (opts.windowMs ?? 10) / 1000));
  const minGap = Math.floor(sampleRate * (opts.minGapMs ?? 80) / 1000);
  const ratio = opts.ratio ?? 2.2, gate = opts.gate ?? 0.02;
  const env = energyEnvelope(samples, windowSize);
  const onsets: number[] = [];
  let floor = 0;
  for (let w = 1; w < env.length; w++) {
    floor = floor * 0.9 + env[w - 1] * 0.1;                     // slow-following floor
    const pos = w * windowSize;
    if (env[w] > gate && env[w] > floor * ratio && (onsets.length === 0 || pos - onsets[onsets.length - 1] >= minGap)) onsets.push(pos);
    if (onsets.length >= maxSlices) break;
  }
  if (onsets.length < 2) return gridSlices(samples.length, Math.min(maxSlices, 8));
  const starts = onsets[0] > windowSize * 2 ? onsets : onsets;   // keep the first onset where it is; leading silence is skipped
  return starts.map((s, i) => ({ start: s, end: i + 1 < starts.length ? starts[i + 1] : samples.length }));
}

/** Slices onto the 16 pads, left to right; empty pads stay null. */
export function padsFromSlices(slices: Slice[]): Pad[] {
  return Array.from({ length: PAD_COUNT }, (_, i) => ({ slice: slices[i] ?? null, pitch: 0, reverse: false, gate: true }));
}

/** Playback rate for a semitone offset (±12). */
export function rateForPitch(semitones: number): number { return Math.pow(2, Math.max(-12, Math.min(12, semitones)) / 12); }

/** A mono Float32Array of the slice (reversed when asked) — the pure half of making a pad buffer. */
export function sliceSamples(samples: Float32Array, slice: Slice, reverse = false): Float32Array {
  const out = samples.slice(Math.max(0, slice.start), Math.min(samples.length, slice.end));
  return reverse ? out.reverse() : out;
}

/** A sequencer step for a tap: the step under the playhead, rounded to the nearest 16th. */
export function quantizeTap(playhead: number, steps: number): number {
  if (playhead < 0) return 0;
  return ((Math.round(playhead) % steps) + steps) % steps;
}

/** A phone pad action (`pad_<n>`, from the controller link) → pad index, or -1. */
export function padFromAction(action: string): number {
  const m = /^pad_(\d{1,2})$/.exec(action);
  if (!m) return -1;
  const i = Number(m[1]);
  return i >= 0 && i < PAD_COUNT ? i : -1;
}
