// HUD MERGE — a HUD patch that changes nothing is not a render (IMPROVE 2026-10-06).
//
// Four duel modes call `ctx.setHud` every frame (guard, chi, hp, focus…), the harness forwards each call to the host's
// `onHud`, and every host merged it with `setHud((prev) => ({ ...prev, ...u }))` — a new object every time, so React
// re-rendered the whole HUD at 60 Hz for values that had not moved. `mergeHud` returns `prev` itself when every key in
// the patch already holds that value (Object.is), and React bails out of a state update that returns the same object.
// The harness-side skip (core/ModeHarness setHud) is the fuller version and is routed to the harness owner; this is the
// host-side half, and it is harmless to keep once that lands.
//
// Pure: no React, no DOM.

export function mergeHud<T extends object>(prev: T, patch: Partial<T>): T {
  let changed = false;
  for (const k in patch) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    if (!Object.is((prev as Record<string, unknown>)[k], (patch as Record<string, unknown>)[k])) { changed = true; break; }
  }
  return changed ? { ...prev, ...patch } : prev;
}
