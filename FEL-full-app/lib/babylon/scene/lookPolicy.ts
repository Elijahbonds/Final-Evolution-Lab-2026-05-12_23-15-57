// WHICH MODES TAKE THE WAVE-2 LOOK (vis-foundation-2, 2026-10-13).
//
// The shared systems this lane adds (fixture lights, the sky, glossy floors, material detail) mount from the rig and the
// harness, so they reach every mode without a mode file — the way A9.1–A9.10 did. One exception, by the owner's word for
// this wave: the HOOPS modes are off-limits ("the owner is actively changing dunk in their own PRs"), so none of the new
// systems changes a hoops frame until that work has landed. Lifting the hold is deleting a mode id from this set.

/** The hoops family (Part B's dunk, dunkduel, onevone, threevthree, threepoint, carnival) and their older aliases. */
export const WAVE2_HELD_MODES: ReadonlySet<string> = new Set([
  'dunk', 'dunkduel', 'threepoint', 'basketball_h2h', 'basketball_dunk',
]);
// vis-hoops-court (owner 2026-10-14, "Go on hoops"): onevone, threevthree and carnival (and the older names 'basketball', 'hoops1v1',
// 'hoops3v3' for 1v1 and 3v3) left this set; the dunk lane lifts its own. Fixture lights, the sky and air, the glossy floor, the decals,
// the wet surface and the sweat now reach those three. A system that looked wrong on one of them is held per mode, with its reason,
// in WAVE2_HELD_SYSTEMS below (none yet).

/** Pure: does this mode take the wave-2 shared look? An unknown mode (a preview, a test scene) does. */
export function wave2Look(modeId: string | null | undefined): boolean {
  return !modeId || !WAVE2_HELD_MODES.has(modeId);
}

/** The mounted mode's id, as the harness records it on the scene (ModeHarness: scene.metadata.felModeId). */
export function sceneModeId(scene: { metadata?: unknown }): string | null {
  const m = scene.metadata as { felModeId?: unknown } | null | undefined;
  return typeof m?.felModeId === 'string' ? m.felModeId : null;
}
