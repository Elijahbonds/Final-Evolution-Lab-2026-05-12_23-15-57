// parkedStage — a parked 3D stage gives its memory back when a game mode mounts (DEMO-SPEED-2, coordinator 2026-10-28).
//
// The library stage (components/library/exercise-stage.tsx) parks itself when it unmounts — its engine, scene, body and
// compiled shaders kept for ten minutes, so the next demo shows in ~0.1 s instead of ~4 s. A game mode on the next route
// needs that memory more than the next demo needs its head start (owner call 3: "phones need the memory back"), so the
// look stack every mode mounts through (lookStack.mountLookStack) releases it first.
//
// No Babylon here, and no import of the stage: the stage registers its release when it parks and withdraws it when a demo
// takes the stage back, so a mode that loads before any demo ever did pays nothing.

let release: (() => void) | null = null;

/** The parked stage's release (one stage is parked at most; a newer one replaces it). */
export function holdParkedStage(fn: () => void): void { release = fn; }

/** A demo took the stage back (or it was disposed): nothing parked to release. */
export function dropParkedStage(fn: () => void): void { if (release === fn) release = null; }

/** Dispose the parked stage, if there is one. Never throws: a mode's mount must not fail over a demo's leftovers. */
export function releaseParkedStage(): boolean {
  const f = release;
  release = null;
  if (!f) return false;
  try { f(); } catch (e) { console.warn('[FEL-LIBRARY] parked stage release failed', e); }
  return true;
}
