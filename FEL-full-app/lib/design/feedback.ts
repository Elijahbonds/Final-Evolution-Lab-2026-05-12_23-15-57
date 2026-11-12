// PRESS FEEDBACK (lane/premium-ui, 2026-10-27; docs/PLAN-UI-10PHASE.md P1): what a tap FEELS like.
//
// Every primary control scales a touch on press (the .fel-press class, CSS only). On top of that, a primary action can
// ask for a haptic tick: navigator.vibrate where the browser has it (Android Chrome; iOS Safari has no Vibration API,
// so nothing happens there and nothing breaks). No tick when motion is reduced — a buzz is motion for the hand.
//
// SOUND HOOKS, OFF BY DEFAULT. A UI sound is opt-in twice: a player has to register one (registerUiSound) AND sound has to
// be switched on (setUiSoundEnabled). Nothing in the app does either today, so no control makes a sound.
import { reducedMotion } from '@/lib/a11y/reducedMotion';

/** The haptic tick, ms. */
export const HAPTIC_MS = { tap: 8, success: [10, 40, 14] as number[] } as const;

export type UiSound = 'tap' | 'success' | 'back';
let soundOn = false;
const players = new Map<UiSound, () => void>();

export function setUiSoundEnabled(on: boolean): void { soundOn = on; }
export function uiSoundEnabled(): boolean { return soundOn; }
export function registerUiSound(name: UiSound, play: () => void): void { players.set(name, play); }

/** PURE-ish: may a haptic fire here? (a Vibration API, and motion not reduced) */
export function canVibrate(nav: { vibrate?: unknown } | undefined, reduced: boolean): boolean {
  return !reduced && !!nav && typeof nav.vibrate === 'function';
}

/** A press: the haptic tick (where supported, motion not reduced) and the registered sound (only when sound is on). */
export function pressFeedback(kind: 'tap' | 'success' = 'tap'): void {
  if (typeof window === 'undefined') return;
  let reduced = false;
  try { reduced = reducedMotion(); } catch { /* storage blocked: treat as not reduced */ }
  const nav = window.navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (canVibrate(nav, reduced)) { try { nav.vibrate!(HAPTIC_MS[kind]); } catch { /* a browser that refuses: silent */ } }
  if (soundOn) players.get(kind)?.();
}
