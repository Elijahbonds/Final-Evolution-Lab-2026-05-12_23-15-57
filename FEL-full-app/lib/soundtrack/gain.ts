// lib/soundtrack/gain.ts — CREATOR SOUNDTRACK: the soundtrack's level arithmetic. Pure.
//
// The chain (player.ts): <audio> → deck gain (this track's normalisation × the crossfade) → stage gain (where we are ×
// the player's soundtrack level) → SoundKit's MUSIC bus (the player's music volume, voiceover's duck under the MC) → out.

import type { SoundtrackStage } from './types';

/** Every track is brought to about this loudness. The house previews are mastered at −14 LUFS (fel_synth TARGET_LUFS). */
export const REFERENCE_LUFS = -16;
/** Normalisation never boosts more than +6 dB (a quiet bedroom mix) or cuts more than 12 dB. */
export const GAIN_MIN_DB = -12;
export const GAIN_MAX_DB = 6;
/** assumption: a track with no measured loudness is treated as a loud modern master (about −10 LUFS). */
export const UNKNOWN_LOUDNESS_GAIN_DB = -6;

/**
 * TUNED (new, plan piece G): menu and loading at full soundtrack level, the in-game bed 14 dB under it (the game's own
 * sound is the foreground), the end screen 3 dB under (the results talk over it).
 */
export const STAGE_GAIN_DB: Readonly<Record<SoundtrackStage, number>> = { menu: 0, loading: 0, bed: -14, end: -3, off: -Infinity };

/** TUNED (owner, 2026-10-06: "menu music … medium"): the soundtrack's own starting level, 0..1, on top of the music bus. */
export const DEFAULT_LEVEL = 0.5;
/** Crossfade between tracks, and the fade when the soundtrack yields to a room or stops. */
export const CROSSFADE_SEC = 2;
export const FADE_SEC = 0.6;

export const dbToGain = (db: number): number => (Number.isFinite(db) ? Math.pow(10, db / 20) : 0);

export function normaliseGainDb(loudnessLufs: number | null | undefined): number {
  if (typeof loudnessLufs !== 'number' || !Number.isFinite(loudnessLufs)) return UNKNOWN_LOUDNESS_GAIN_DB;
  return Math.max(GAIN_MIN_DB, Math.min(GAIN_MAX_DB, REFERENCE_LUFS - loudnessLufs));
}

export const clampLevel = (v: unknown): number =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_LEVEL);

/** The stage node's gain: where we are × the player's soundtrack level. */
export function stageGain(stage: SoundtrackStage, level: number): number {
  return dbToGain(STAGE_GAIN_DB[stage]) * clampLevel(level);
}

/** Equal-power crossfade at progress p (0 → 1): the outgoing and incoming decks' gains. */
export function crossfadeGains(p: number): { out: number; in: number } {
  const t = Math.max(0, Math.min(1, p));
  return { out: Math.cos((t * Math.PI) / 2), in: Math.sin((t * Math.PI) / 2) };
}
