// lib/audio/volumes.ts — MUSIC-SUITE P7 (2026-09-29), room-mix-ux, task 3 of 3 ("MUSIC / SFX / VOICE volume sliders").
//
// THE ASK: three player-set levels for the one audio graph SoundKit builds (SoundKit.ts) — MUSIC (the Cypher's song
// stems and 808 kit, DanceMode's `bus`), SFX (hit sounds and UI: SoundKit.play('uiTick' | 'impact' | …)) and VOICE
// (the host / Professor Okta lines landing in phase 8, SoundKit's voiceBus) — persisted per player ON THE DEVICE,
// reachable from the dance room's pause screen and the Academy's STUDIO tab, applied live with a short ramp so a
// drag never clicks. "Defaults leave today's balance unchanged" is not a note, it is the whole contract: every bus
// already plays at its own tuned base gain (SoundKit.ts's voiceBus 1.35, musicBus 1/MASTER_GAIN, the new sfxBus 1),
// and a volume of 1.0 — the default, and what every existing player has today — must multiply that base by exactly
// 1, so nobody who has never touched a slider hears anything different.
//
// PURE ON PURPOSE. This module owns no AudioContext, no AudioParam, no window beyond a guarded localStorage read —
// the same shape SoundKit.ts already uses for its own on/off voice preference (readVoicePref/writeVoicePref below
// it in that file). That means it needs no DOM and no fake Web Audio to test (vitest's node environment, this repo's
// default): `busGain` is the entire "does a bus scale only its own source" claim, checkable with plain numbers.
// SoundKit.ts is where the arithmetic actually reaches a GainNode; this file is where it is correct.

export type VolumeBus = 'music' | 'sfx' | 'voice';

export interface VolumeSettings {
  music: number;
  sfx: number;
  voice: number;
}

/** Every existing player is at these today, in effect — a bus with no saved level plays at its own tuned base gain,
 *  unchanged. Never edit these to "fix" a balance; that is what the sliders are for. */
export const DEFAULT_VOLUMES: Readonly<VolumeSettings> = Object.freeze({ music: 1, sfx: 1, voice: 1 });

/** One player, one device: this never leaves it (no route reads it, no session payload carries it). */
export const VOLUME_KEY = 'fel-audio-volumes';

/** A slider's range is 0 (silent) .. 1 (the bus's own tuned level) — never a boost past what SoundKit already
 *  tuned it to. Anything else (a corrupt read, a stray NaN, a future >1 write) clamps back into range. */
export function clampVolume(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_VOLUMES.music;
}

/** The raw saved object, or {} for a private window, a first run, or JSON that will not parse — every caller goes
 *  through loadVolumes(), which fills in and clamps, so a bad read never reaches a bus as a bad number. */
function readStore(): Partial<Record<VolumeBus, unknown>> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(VOLUME_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<Record<VolumeBus, unknown>>) : {};
  } catch {
    return {};
  }
}

function writeStore(next: VolumeSettings): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(VOLUME_KEY, JSON.stringify(next));
  } catch {
    /* private mode, or the quota is spent: the setting lasts the session, like SoundKit's own voice pref */
  }
}

/** The saved levels, defaults filled in, every value clamped — never throws, never returns anything a slider or a
 *  gain node couldn't use as-is. */
export function loadVolumes(): VolumeSettings {
  const raw = readStore();
  return {
    music: clampVolume(raw.music ?? DEFAULT_VOLUMES.music),
    sfx: clampVolume(raw.sfx ?? DEFAULT_VOLUMES.sfx),
    voice: clampVolume(raw.voice ?? DEFAULT_VOLUMES.voice),
  };
}

/** Move one bus and persist it — merged with whatever the other two already were, so setting SFX never touches a
 *  saved MUSIC or VOICE level. Returns the full settings, clamped, for the caller to apply live at once. */
export function saveVolume(bus: VolumeBus, level: number): VolumeSettings {
  const next = { ...loadVolumes(), [bus]: clampVolume(level) };
  writeStore(next);
  return next;
}

/** The live ramp every slider move gets (an AudioParam's setTargetAtTime time constant) — short enough a drag still
 *  feels connected to the sound, long enough that a step never clicks. Matches the desk's own glide family
 *  (mixGraph.ts RAMP_TC, 8 ms) at a size tuned for a much less frequent control (a slider, not a live mixer fader). */
export const VOLUME_RAMP_TC = 0.05;

/**
 * A bus's live gain: its own tuned base level times the player's volume for it, and nothing else — this one line is
 * the entire "music/sfx/voice each scale only their sources" claim, and SoundKit.ts calls this exact function so the
 * graph and this module can never drift apart. `busGain(base, 1)` is always exactly `base` (the default-unchanged
 * contract); `busGain(base, 0)` is always exactly silent.
 */
export function busGain(baseGain: number, volume: number): number {
  return baseGain * clampVolume(volume);
}

/** Every bus's live gain from one settings object, each against its own base — a convenience for a caller (a test,
 *  or a future desk) that wants all three at once; SoundKit.ts still calls busGain() per bus as each node is built. */
export function busGains(bases: Readonly<Record<VolumeBus, number>>, volumes: Readonly<VolumeSettings>): Record<VolumeBus, number> {
  return { music: busGain(bases.music, volumes.music), sfx: busGain(bases.sfx, volumes.sfx), voice: busGain(bases.voice, volumes.voice) };
}
