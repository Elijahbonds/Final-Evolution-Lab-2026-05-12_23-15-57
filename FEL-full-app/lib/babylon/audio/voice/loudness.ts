// loudness: how loud each voice lands, and the trims that even it out (VOICEOVER, 2026-10-06).
//
// Owner: "too loud / quiet against music and effects, hard to hear on a TV or phone".
//
// WHAT WAS MEASURED (scratchpad/voiceover/routes.mjs, music.mjs, aacgain.mjs; numbers in the commit body):
//   1. The files. tools/voice/render-mic.py levels every clip to a voiced RMS of -19 dBFS with peaks under -1 dBFS, so the files
//      themselves were built to one level. Their true loudness could not be re-measured here: they are AAC, and this machine has
//      no AAC decoder (no ffmpeg; the bundled Chromium has no proprietary codecs). The AAC bitstream's global gain was read
//      frame by frame for all 3,194 clips instead, and REJECTED as a loudness measure: it splits by the voice's pitch, not its
//      level (every female voice reads ~10 dB "quieter" than every male voice, crowd_a/c/e vs crowd_b/d/f, velvet/nova vs
//      unclejune/moss, though the renderer levelled them all alike). So the per-file table below starts EMPTY, and is filled
//      from a real decode: `lufs` in a bank's index (tools/voice/measure-loudness.py writes it on the owner's Mac, where
//      afconvert decodes AAC) or CAST_TRIM_DB.
//   2. The routes. Simulated sample by sample on speech levelled the renderer's way (-19 dBFS voiced RMS), through VoiceKit's
//      exact chains (the PA: band-pass, +4.5 dB horn, x1.4, tanh drive, x0.7, a -18 dB 4:1 compressor whose automatic makeup
//      adds ~8 dB, slap and room; the dry path: x0.8):
//         the court MC on the PA  -12.4 .. -13.4 dBFS (median -12.9)     the sidekick  -13.0 .. -14.0
//         a player / the Coach / Professor Okta, dry   -20.9             a crowd voice  -24.2 (meant to sit under)
//      So every dry voice (rival and hooper chatter, the Coach, Okta) landed 8 dB under the MC. That is the "too quiet" half.
//   3. The music. The six songs' full mixes decode as MP3 in Chromium: -14.3 / -14.4 LUFS integrated, peaks -3.6 .. -4.5 dBFS,
//      played at unity through the music bus. Stoop on the PA lands about 4 dB over them before ducking.
//
// THE TRIMS (dB, applied per line on the voice's own gain node, before the voice bus):
//   ROUTE_TRIM_DB  TUNED: player / coach 0 -> +6 dB, so a dry voice sits 2 dB under the MC instead of 8 (still "on the court, not
//                  on the PA", and still under it: the MC owns the mic). The MC, the sidekick and the crowd are unchanged.
//   clip trim      TARGET_LUFS - the clip's measured loudness, clamped to +/- MAX_CLIP_TRIM_DB, when a measurement exists.

import type { MicRole } from '../mic/MicDirector';

/** The level the renderer levels every clip to (voiced RMS, dBFS): a measured clip is trimmed back to it. */
export const TARGET_LUFS = -19;
/** TUNED: a clip trim larger than this is a bad take to re-render, not a level to fix in the mix. */
export const MAX_CLIP_TRIM_DB = 6;

/** Simulated route levels for a -19 dBFS clip (dBFS RMS, see the file header). Documentation for the trims, and the test's anchor. */
export const ROUTE_LEVEL_DB: Readonly<Record<MicRole, number>> = Object.freeze({ mc: -12.9, side: -13.5, player: -20.9, coach: -20.9, crowd: -24.2 });

/** TUNED (VOICEOVER 2026-10-06): player / coach 0 -> +6 dB (see the header). */
export const ROUTE_TRIM_DB: Readonly<Record<MicRole, number>> = Object.freeze({ mc: 0, side: 0, player: 6, coach: 6, crowd: 0 });

/** Per-voice trims from a real decode (dB). Empty until measured: see the header, point 1. */
export const CAST_TRIM_DB: Readonly<Record<string, number>> = Object.freeze({});

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => 20 * Math.log10(Math.max(g, 1e-9));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** A clip's own trim (dB): back to TARGET_LUFS when its loudness was measured, else 0 (the renderer already levelled it). */
export function clipTrimDb(line?: { lufs?: number } | null): number {
  const l = line?.lufs;
  return typeof l === 'number' && Number.isFinite(l) ? clamp(TARGET_LUFS - l, -MAX_CLIP_TRIM_DB, MAX_CLIP_TRIM_DB) : 0;
}

/** The linear gain one clip plays at: its route's trim, its voice's trim and its own, on top of the cue's relative gain. */
export function lineGain(role: MicRole, cast: string, line: { lufs?: number } | null | undefined, cueGain = 1): number {
  return cueGain * dbToGain((ROUTE_TRIM_DB[role] ?? 0) + (CAST_TRIM_DB[cast] ?? 0) + clipTrimDb(line));
}
