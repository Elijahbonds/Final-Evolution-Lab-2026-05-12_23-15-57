// WHICH MODES TAKE THE WAVE-2 LOOK (vis-foundation-2, 2026-10-13).
//
// The shared systems this lane adds (fixture lights, the sky, glossy floors, material detail) mount from the rig and the
// harness, so they reach every mode without a mode file — the way A9.1–A9.10 did. One exception, by the owner's word for
// this wave: the HOOPS modes are off-limits ("the owner is actively changing dunk in their own PRs"), so none of the new
// systems changes a hoops frame until that work has landed. Lifting the hold is deleting a mode id from this set.
//
// LIFTED (vis-hoops-dunk, owner 2026-10-14 "Go on hoops"): dunk, dunkduel and threepoint (and the dunk venue spec's id) take the
// wave-2 look. Each hoops lane removes only its own modes; onevone, threevthree and carnival stay here until vis-hoops-court lifts them.

/** The hoops family (Part B's dunk, dunkduel, onevone, threevthree, threepoint, carnival) and their older aliases. */
export const WAVE2_HELD_MODES: ReadonlySet<string> = new Set([
  'onevone', 'threevthree', 'carnival', 'basketball', 'hoops1v1', 'hoops3v3', 'basketball_h2h',
]);

/** Pure: does this mode take the wave-2 shared look? An unknown mode (a preview, a test scene) does. */
export function wave2Look(modeId: string | null | undefined): boolean {
  return !modeId || !WAVE2_HELD_MODES.has(modeId);
}

/** The mounted mode's id, as the harness records it on the scene (ModeHarness: scene.metadata.felModeId). */
export function sceneModeId(scene: { metadata?: unknown }): string | null {
  const m = scene.metadata as { felModeId?: unknown } | null | undefined;
  return typeof m?.felModeId === 'string' ? m.felModeId : null;
}
