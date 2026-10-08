// The card's sound and buzz: SoundKit's synthesised cues on the sfx bus (so the player's SFX volume applies) and the
// shared haptics adapter. Loaded lazily — the card must never pull the audio graph into a server render — and every call
// is best-effort: no audio context, no vibration motor, no pad actuator just means silence.

import type { Cue } from './reveal';

export interface EndFx { cue: (c: Cue) => void }

export const SILENT_FX: EndFx = { cue: () => {} };

type Kit = typeof import('@/lib/babylon/audio/SoundKit')['SoundKit'];
type Hap = typeof import('@/lib/babylon/premium/Haptics');

let kit: Kit | null = null;
let hap: Hap | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      import('@/lib/babylon/audio/SoundKit').then((m) => { kit = m.SoundKit; }).catch(() => {}),
      import('@/lib/babylon/premium/Haptics').then((m) => { hap = m; }).catch(() => {}),
    ]).then(() => {});
  }
  return loading;
}

function play(c: Cue): void {
  try {
    switch (c) {
      case 'win': kit?.play('crowdCheer', { volume: 0.55 }); kit?.play('score'); hap?.HAPTIC.perfect(); hap?.padRumble(0.5, 140); break;
      case 'record': kit?.play('powerUp', { pitch: 1.15 }); hap?.HAPTIC.perfect(); hap?.padRumble(0.6, 160); break;
      case 'levelUp': kit?.play('powerUp'); hap?.HAPTIC.impact(); hap?.padRumble(0.7, 180); break;
      case 'soft': kit?.play('uiTick', { pitch: 0.8, volume: 0.6 }); break;
      default: kit?.play('uiTick'); hap?.HAPTIC.tap(); break;
    }
  } catch { /* a cue never breaks the card */ }
}

/** The live adapter. The first cue may arrive before the modules load; it plays as soon as they have. */
export const browserFx: EndFx = {
  cue: (c) => {
    if (typeof window === 'undefined') return;
    if (kit) play(c);
    else void load().then(() => play(c));
  },
};
