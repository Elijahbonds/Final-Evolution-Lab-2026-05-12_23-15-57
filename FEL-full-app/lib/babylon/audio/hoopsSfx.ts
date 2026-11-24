// hoopsSfx — three sound leftovers of the hoops-sound lane (phase 11a), each behind its own switch (lane/hoops-items, 2026-11-18).
//
//   THE 3V3 THROW. A pass played SoundKit's `uiTick` — the menu click — on the throw (HOOPS-AAA-GAP-SHOW §3: "a 3v3 pass plays uiTick").
//     The pass is heard in the hands when it is caught since hoops-sound (`hoops.passCatchSoundOn`), and a sling pass keeps its whoosh;
//     the click on the throw goes (`hoops.passThrowQuietOn` 1). 0 = the click, as before.
//   THE DRIFT. The DRIFT callout (LT on the turbo: a hard cut that slides and keeps the speed) played the net's swish (pitch 0.8). A
//     slide on a court is a shoe on the floor: it squeaks, like the hardest cut the scuff plays (`hoops.driftSqueakOn` 1). 0 = the swish.
//   THE BACKBOARD KISS. A banked ball touching the glass played the body-on-the-floor `thud` at pitch 1.5. It has its own cue now,
//     `glass` (SoundKit: a ball on a board — the recording "Ball against wall", BigSoundBank s1825, CC0, already in the set as
//     bounce_6 — with its own synth as the fallback), at the level the thud had (`hoops.glassSoundOn` 1). 0 = the thud.
//
// Pure: which cue to play and with what. The modes call SoundKit.play(cue.name, cue.opts) with what these hand back.
import { feel } from '../../feel-panel/feel';
import { scuffVolume } from '../core/ScuffFx';

/** feel knob `hoops.passThrowQuietOn`: the 3v3 throw plays no menu click (1) / the click as before (0). */
export const PASS_THROW_QUIET_ON = 1;
/** feel knob `hoops.driftSqueakOn`: the DRIFT plays a shoe squeak (1) / the swish as before (0). */
export const DRIFT_SQUEAK_ON = 1;
/** feel knob `hoops.glassSoundOn`: the backboard kiss plays its own sound (1) / the floor thud as before (0). */
export const GLASS_SOUND_ON = 1;

export type HoopsCue = 'uiTick' | 'swish' | 'squeak' | 'thud' | 'glass';
export interface CueCall { name: HoopsCue; opts: { pitch?: number; volume?: number } }

/** The click a 3v3 throw played, by pass type (as it was: bounce 1.0, lob 0.8, chest 1.3; volume 1) — or null: no click. */
export function passThrowClick(type: string, click = feel('hoops.passThrowQuietOn', PASS_THROW_QUIET_ON) < 0.5): CueCall | null {
  if (!click) return null;
  return { name: 'uiTick', opts: { pitch: type === 'bounce' ? 1.0 : type === 'lob' ? 0.8 : 1.3 } };
}

/** The DRIFT's sound: the hardest cut's squeak (the scuff at full strength: ScuffFx scuffVolume(1), the pitch 0.92 + 0.2 the modes
 *  give a full-strength scuff) — or the swish as before. */
export function driftSound(on = feel('hoops.driftSqueakOn', DRIFT_SQUEAK_ON) >= 0.5): CueCall {
  return on ? { name: 'squeak', opts: { pitch: 1.12, volume: scuffVolume(1) } } : { name: 'swish', opts: { pitch: 0.8, volume: 0.4 } };
}

/** The backboard kiss: its own `glass` cue at the thud's volume — or the thud at pitch 1.5, as before. */
export function glassKissSound(on = feel('hoops.glassSoundOn', GLASS_SOUND_ON) >= 0.5): CueCall {
  return on ? { name: 'glass', opts: { volume: 0.35 } } : { name: 'thud', opts: { pitch: 1.5, volume: 0.35 } };
}

// ── hoops-gap (lane/hoops-gap, 2026-11-23): THE CONTACT VOICE (`hoops.contactVoiceOn`, OFF) ─────────────────────────────────────────────
// Every contact in 1v1 / 3v3 — a body bump, a chest-to-chest check, a knockdown, a strip, a poke, a parry, a block — plays SoundKit's
// `impact`: a square-wave boop with a noise crack, an arcade sound, at a pitch per kind. The modes already sort them by pitch: the hands on
// the ball high (strips, steals, the parry and the swats at 1.2–1.5), the bodies low (bumps 0.82–1.0, a body on the floor 0.7). With the
// switch and the court's sample bank active, `impact` is re-voiced from the kit's own sounds (no new files): a hand on the ball is the
// recorded palm-on-leather slap (`catch`, pitched down: a harder hit than a catch) over a short knock; a body is the low, ringless `thud`
// (the body-on-the-floor synth). The volume each call asks for is kept, scaled to the impact's level (CONTACT_*_GAIN, measured with
// scripts/probes/hoops-sound/loudness.mts); a contact inside CONTACT_MIN_GAP_SEC of the last is dropped (a pile-up of one collision).
export const CONTACT_VOICE_ON = 0;
/** An impact at this pitch or higher is a hand on the ball (the modes' strip / steal / parry / block pitches); below, a body. */
export const CONTACT_HAND_PITCH = 1.2;
/** The re-voiced levels against the impact they replace (× the call's volume). */
// Measured (loudness.mts, the loudest 50 ms at the limiter, at the modes' pitches and volumes): at the first draft's 1.0 / 0.35 / 0.9 the
// bodies came out 2.0–2.2 dB over today's impact and the hands 3.0–3.3 dB under it; set to land on it (bodies × 0.79, hands × 1.45).
export const CONTACT_HAND_GAIN = 1.45, CONTACT_KNOCK_GAIN = 0.5, CONTACT_BODY_GAIN = 0.71;
/** Two contacts closer than this (s) are one: the second is dropped. */
export const CONTACT_MIN_GAP_SEC = 0.06;
export function contactVoiceOn(): boolean { return feel('hoops.contactVoiceOn', CONTACT_VOICE_ON) >= 0.5; }
/** The cues an `impact` at `pitch` / `volume` becomes (pure). */
export function contactVoice(pitch: number, volume: number): Array<{ name: 'catch' | 'thud'; opts: { pitch: number; volume: number } }> {
  if (pitch >= CONTACT_HAND_PITCH) {
    return [
      { name: 'catch', opts: { pitch: Math.max(0.6, Math.min(1.1, 0.55 + pitch * 0.25)), volume: volume * CONTACT_HAND_GAIN } },
      { name: 'thud', opts: { pitch: 1.4, volume: volume * CONTACT_KNOCK_GAIN } },
    ];
  }
  return [{ name: 'thud', opts: { pitch: Math.max(0.6, Math.min(1.2, 0.35 + pitch * 0.65)), volume: volume * CONTACT_BODY_GAIN } }];
}
