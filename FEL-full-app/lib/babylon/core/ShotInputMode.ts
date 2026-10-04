// ShotInputMode — HOOPS-10PHASE-2 phase 2 (2026-10-03). Elijah has not yet picked between "hold and release" and
// "tap on time" for the 3PT shot (open question, FE PM note same day). Rather than build two mechanics, both
// controls sit on top of ONE meter (BasketballCore.ShotMeter, graded against the jumpshot clip's real release
// frame) and this module is only the setting that decides which edge of the press GRADES the shot:
//
//   'hold-release' — press starts the gather + the jumper and the meter; the RELEASE grades it (2K's shot button).
//   'tap-timing'    — a single tap both starts and grades it, against a meter already sweeping on its own (the
//                      touch / controller-accessibility fallback promised alongside hold-release).
//
// Pure default + a browser-only persisted override, same shape as tvMode's readDisplaySetting: the default is
// read once per load (a player who flips it mid-rack must not be judged by two different controls in one rack).
export type ShotInputMode = 'hold-release' | 'tap-timing';

/** Elijah's call is still open; 'hold-release' is the FE PM's stated default until he picks. */
export const DEFAULT_SHOT_INPUT: ShotInputMode = 'hold-release';

const STORAGE_KEY = 'fel.hoops.shotInput';

function isShotInputMode(v: unknown): v is ShotInputMode {
  return v === 'hold-release' || v === 'tap-timing';
}

/** The setting for this load: a persisted player choice if one exists, else the default. Never touches
 *  localStorage outside a browser (SSR / tests / node probes all get the pure default). */
export function readShotInputMode(): ShotInputMode {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_SHOT_INPUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isShotInputMode(raw) ? raw : DEFAULT_SHOT_INPUT;
  } catch {
    return DEFAULT_SHOT_INPUT;   // a private-browsing throw is not a crash
  }
}

/** Persist the player's choice. A no-op outside a browser. */
export function setShotInputMode(mode: ShotInputMode): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* private-browsing quota — the setting just doesn't stick */ }
}
