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
