// Real-time screen cues: full-screen colour flashes, short tones and vibration (SCREEN-REALTIME).
// Web Audio and navigator.vibrate only — no packages. Camera video never leaves the device.
import type { RepMark } from '@/lib/assess/runner';

export type FlashKind = 'countdown' | 'start' | 'captured' | 'done' | 'retry' | 'warn';

export const FLASH_COLOUR: Record<FlashKind, string> = {
  countdown: '#00E5FF',
  start: '#00FF9D',
  captured: '#00FF9D',
  done: '#00E5FF',
  retry: '#FFB020',
  warn: '#FFB020',
};

/** How long a full-screen flash stays visible (ms). */
export const FLASH_MS = 420;

/** Hold still with a good frame before the 3-2-1 (ms). */
export const STILL_HOLD_MS = 900;

/** Auto-advance after a test mini-result (ms). */
export const AUTO_ADVANCE_MS = 1800;

/** Pose rate must hold at this level before the device check auto-continues (Hz). */
export const DEVICE_AUTO_FPS = 12;

/** How long pose rate must hold before auto-continue (ms). */
export const DEVICE_AUTO_MS = 900;

let audio: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    audio ??= new AudioContext();
    return audio;
  } catch {
    return null;
  }
}

/** A short tone at `hz` for `ms` (Web Audio). */
export function playTone(hz: number, ms: number, gain = 0.22): void {
  const c = ctx();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = hz;
    g.gain.value = gain;
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + ms / 1000);
  } catch { /* no audio */ }
}

export function buzz(ms = 28): void {
  try { navigator.vibrate?.(ms); } catch { /* iOS: no vibrate */ }
}

export function cueFlash(kind: FlashKind): void {
  switch (kind) {
    case 'countdown': playTone(440, 90); break;
    case 'start': playTone(660, 140); buzz(40); break;
    case 'captured': playTone(520, 80); buzz(22); break;
    case 'done': playTone(784, 160); buzz(50); break;
    case 'retry': playTone(330, 120); buzz(35); break;
    case 'warn': playTone(280, 100); break;
  }
}

export function cueRep(mark: RepMark): void {
  if (mark === 'notRead') { cueFlash('retry'); return; }
  cueFlash('captured');
}
