// The Flip (SPEC-PASSION-PIPELINES lane 2 M1) — chop a source into pads the way a producer flips a record on an MPC:
// a 4×4 pad grid, slices found on transients (or a plain grid), pitch/reverse per pad, taps recorded into the groovebox.
//
// SOURCES ARE THE RULE, not the feature: FEL's own kit stems, the player's own recordings, and public-domain recordings
// with a documented rationale (the Free-Use Legends model). Never third-party catalogue audio — the reel that inspired
// this flipped a copyrighted theme; FEL's version flips what FEL is allowed to flip. The pure parts are tested.

export type SourceKind = 'fel' | 'own' | 'public-domain';
/**
 * Where the FLIP tab's shelf puts a built-in source (MUSIC-SUITE P5). 'public-domain' holds only entries the owner has
 * signed (pdShelf.ts); it is empty today.
 */
export type FlipShelfGroup = 'themes' | 'loops' | 'vox' | 'kits' | 'textures' | 'public-domain';
export interface FlipSource { id: string; label: string; url?: string; kind: SourceKind; note: string; group?: FlipShelfGroup }
export const ALLOWED_SOURCE_KINDS: SourceKind[] = ['fel', 'own', 'public-domain'];
export function isAllowedSource(kind: unknown): kind is SourceKind { return typeof kind === 'string' && (ALLOWED_SOURCE_KINDS as string[]).includes(kind); }

/**
 * MUSIC-SUITE P5 (2026-09-25), "The Flip, for real" — THE FEL FLIP PACK IS THE SHELF NOW.
 *
 * What was wrong: the Flip's only built-in sources were the eight 808 one-shots (public/audio/kits/808, 0.06–0.60 s each).
 * A one-shot has one onset, and below two onsets onsetSlices (below) falls back to 8 equal grid slices, so every FEL
 * stem chopped into 8 slivers of ONE hit — clicks, not a flip (P1 flip-tab frame; flippack CONTRACT §12.3). There was nothing
 * built in that a producer would actually chop.
 *
 * Now: FEL's own Flip pack (public/audio/flip: 69 files, 2.49 MB, every one generated from code by FEL — its record is
 * public/audio/flip/PROVENANCE.json, and provenance.test.ts holds every file to it). Chop sources (themes, loops, vox
 * sheets) load on the pack's own cuts (`suggestedPads`, "FEL cuts" — flipPack.ts): 9–16 musical events, pads 1→N in
 * order play the phrase back. One-shots (stabs, hits, single vox chops, textures) load WHOLE as a kit: one file per
 * pad, never through the finder (a kit URL under FLIP_KIT_PATH — flipPack.ts decodes and joins the files, the cut
 * between two pads is exactly where one file ends). The 808 kit stays reachable as one of those kits (FEL_808_KIT).
 *
 * This list is static so the shelf draws before pack.json arrives (136 KB, fetched on the FLIP tab); flipPack.test.ts
 * pins it to pack.json item for item, so the two can't drift. Grouped by kind: THEMES, LOOPS, VOX, KITS, TEXTURES.
 */
export const FLIP_PACK_AUDIO = '/audio/flip/audio/';
/** A kit's source URL: `/audio/flip/banks/<bank id>`. Not a file — flipPack.decodeFlipPackSource builds it from its pads. */
export const FLIP_KIT_PATH = '/audio/flip/banks/';
export const FEL_PACK_NOTE = 'FEL original, generated from code (the FEL Flip pack 1.0.0; record: public/audio/flip/PROVENANCE.json).';
/** FEL's first flip library, the 808 kit stems (first-party, public/audio/kits/808), one stem per pad. */
export const FEL_808_KIT = {
  id: 'bank_808', title: '808 Kit',
  pads: ['kick', 'snare', 'hat', 'openhat', 'clap', 'bass', 'lead', 'fx'].map((n) => `/audio/kits/808/${n}.wav`),
} as const;
/** The textures load whole as their own kit (the pack has no bank for them; a crackle through the finder = 16 pops). */
export const FLIP_TEXTURE_KIT_ID = 'bank_textures';

const packSource = (id: string, label: string, group: FlipShelfGroup): FlipSource =>
  ({ id, label, url: `${FLIP_PACK_AUDIO}${id}.mp3`, kind: 'fel', group, note: FEL_PACK_NOTE });
const kitSource = (id: string, label: string, group: FlipShelfGroup, note = FEL_PACK_NOTE): FlipSource =>
  ({ id, label, url: `${FLIP_KIT_PATH}${id}`, kind: 'fel', group, note });

/** The built-in shelf, in the order the FLIP tab shows it. Public-domain entries join from pdShelf.ts once signed. */
export const FEL_SOURCES: FlipSource[] = [
  packSource('theme_a_sunday_tape', 'Sunday Tape', 'themes'),
  packSource('theme_b_skyline', 'Skyline Anthem', 'themes'),
  packSource('theme_c_dust_strings', 'Dust & Strings', 'themes'),
  packSource('loop_arp_pluck', 'Night Arp', 'loops'),
  packSource('loop_bass_riff', 'Pocket Bass', 'loops'),
  packSource('loop_ep_soul', 'Velvet Keys', 'loops'),
  packSource('loop_flute_riff', 'Rooftop Flute', 'loops'),
  packSource('loop_gtr_pluck', 'Nylon Pluck', 'loops'),
  packSource('loop_horn_riff', 'Horn Section', 'loops'),
  packSource('loop_kalimba_steps', 'Kalimba Steps', 'loops'),
  packSource('loop_organ_gospel', 'Church Stabs', 'loops'),
  packSource('loop_string_stabs', 'String Stabs', 'loops'),
  packSource('loop_vox_choir', 'Choir Hits', 'loops'),
  packSource('chop_sheet_bright', 'Vox Sheet (bright)', 'vox'),
  packSource('chop_sheet_deep', 'Vox Sheet (deep)', 'vox'),
  packSource('chop_sheet_warm', 'Vox Sheet (warm)', 'vox'),
  kitSource('bank_vox_bright', 'Vox Chops (bright)', 'vox'),
  kitSource('bank_vox_deep', 'Vox Chops (deep)', 'vox'),
  kitSource('bank_vox_warm', 'Vox Chops (warm)', 'vox'),
  kitSource('bank_kit_fel', 'FEL Kit', 'kits'),
  kitSource(FEL_808_KIT.id, FEL_808_KIT.title, 'kits', "FEL's own 808 kit stems — first-party audio (public/audio/kits/808), one per pad."),
  kitSource(FLIP_TEXTURE_KIT_ID, 'Textures', 'textures'),
];

/** The shelf's groups, in order, with the words on their tabs. */
export const FLIP_SHELF_GROUPS: { id: FlipShelfGroup; label: string }[] = [
  { id: 'themes', label: 'THEMES' }, { id: 'loops', label: 'LOOPS' }, { id: 'vox', label: 'VOX' },
  { id: 'kits', label: 'KITS' }, { id: 'textures', label: 'TEXTURES' }, { id: 'public-domain', label: 'PUBLIC DOMAIN' },
];

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
  // MUSIC-SUITE P5 (2026-09-25), the pack contract's 12.1: this line was `onsets[0] > windowSize * 2 ? onsets : onsets` — a
  // no-op. The loop above starts at window 1 and never marks window 0, so a file that starts ON its transient (every FEL
  // pack item, most trimmed uploads) put pad 1 at 10 ms and cut the downbeat's attack off. A first onset within two
  // windows of the head is the head. Leading silence longer than that is still skipped.
  if (onsets[0] <= windowSize * 2) onsets[0] = 0;
  return onsets.map((s, i) => ({ start: s, end: i + 1 < onsets.length ? onsets[i + 1] : samples.length }));
}

/** Slices onto the 16 pads, left to right; empty pads stay null. */
export function padsFromSlices(slices: Slice[]): Pad[] {
  return Array.from({ length: PAD_COUNT }, (_, i) => ({ slice: slices[i] ?? null, pitch: 0, reverse: false, gate: true }));
}

/**
 * A GATED pad stops this long after it starts (seconds of what you hear). MUSIC-SUITE P5: named — it was the literal 1.2 in
 * FlipPad's play(), and the baked chop a grid row plays (chopEdit.bakeChop) is cut at the same point, so they match.
 */
export const GATE_MAX_S = 1.2;

/** Playback rate for a semitone offset (±12). */
export function rateForPitch(semitones: number): number { return Math.pow(2, Math.max(-12, Math.min(12, semitones)) / 12); }

/** A mono Float32Array of the slice (reversed when asked) — the pure half of making a pad buffer. */
export function sliceSamples(samples: Float32Array, slice: Slice, reverse = false): Float32Array {
  const out = samples.slice(Math.max(0, slice.start), Math.min(samples.length, slice.end));
  return reverse ? out.reverse() : out;
}

/**
 * A sequencer step for a tap: the step under the playhead, rounded to the nearest 16th.
 * MUSIC-SUITE P5 (2026-09-25): the Flip no longer records with this. The playhead it was given is the last step that has
 * SOUNDED (an integer, so the round did nothing), so a tap 20 ms early landed on the step already playing. ARM REC now
 * reads the audio clock (chopEdit.recordStep: the nearest step, or the step the tap falls in with QUANTIZE off).
 */
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
