// FEEL (CREATOR-PLAN phase 4d, 2026-10-06): soft UI sounds and haptics on the Studio's selections and snaps, through the
// game's own helpers — SoundKit's synthesised `uiTick` (lib/babylon/audio/SoundKit.ts, no audio asset) and the one
// haptics adapter (premium/Haptics: navigator.vibrate where it exists, a gamepad's rumble when a pad is in use). Every
// cue is quiet and short: an editor is played for an hour, not a match.

import { SoundKit } from '../../audio/SoundKit';
import { padRumble, vibrate } from '../../premium/Haptics';

export type FeelCue = 'select' | 'snap' | 'undo' | 'shot' | 'photo' | 'saved' | 'deny';

/** Each cue: the tick's pitch and volume, the vibration pattern (ms), and a pad rumble (strength, ms) or none.
 *  TUNED (phase 4d — the owner's ear is the judge): ticks at 0.18–0.35 volume, buzzes of 6–14 ms. */
export const FEEL: Record<FeelCue, { pitch: number; volume: number; buzz: number | number[]; rumble: [number, number] | null }> = {
  select: { pitch: 1.25, volume: 0.22, buzz: 6, rumble: null },
  snap: { pitch: 1.6, volume: 0.3, buzz: [8, 24, 6], rumble: [0.25, 40] },
  undo: { pitch: 0.85, volume: 0.18, buzz: 6, rumble: null },
  shot: { pitch: 1.05, volume: 0.16, buzz: 0, rumble: null },
  photo: { pitch: 1.9, volume: 0.35, buzz: [10, 30, 10], rumble: [0.4, 80] },
  saved: { pitch: 1.45, volume: 0.3, buzz: [8, 20, 8], rumble: [0.3, 60] },
  deny: { pitch: 0.6, volume: 0.22, buzz: 14, rumble: null },
};

export interface FeelOut { tick(pitch: number, volume: number): void; buzz(p: number | number[]): void; rumble(s: number, ms: number): void }

const live: FeelOut = {
  tick: (pitch, volume) => { try { SoundKit.play('uiTick', { pitch, volume }); } catch { /* no audio */ } },
  buzz: (p) => { if (p) vibrate(p); },
  rumble: (s, ms) => { try { padRumble(s, ms); } catch { /* no pad */ } },
};

/** Play a cue. `pad`: a gamepad is in use (it rumbles instead of the phone buzzing). */
export function feel(cue: FeelCue, o: { pad?: boolean; out?: FeelOut } = {}): void {
  const f = FEEL[cue];
  const out = o.out ?? live;
  out.tick(f.pitch, f.volume);
  if (o.pad && f.rumble) out.rumble(f.rumble[0], f.rumble[1]);
  else out.buzz(f.buzz);
}
