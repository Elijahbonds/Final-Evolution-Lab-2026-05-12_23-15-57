// WHICH MODES TAKE THE WAVE-2 LOOK (vis-foundation-2, 2026-10-13).
//
// The shared systems this lane adds (fixture lights, the sky, glossy floors, material detail) mount from the rig and the
// harness, so they reach every mode without a mode file — the way A9.1–A9.10 did. One exception, by the owner's word for
// this wave: the HOOPS modes are off-limits ("the owner is actively changing dunk in their own PRs"), so none of the new
// systems changes a hoops frame until that work has landed. Lifting the hold is deleting a mode id from this set.
//
// LIFTED (vis-hoops-dunk, owner 2026-10-14 "Go on hoops"): dunk, dunkduel and threepoint (and the dunk venue spec's id) take the
// wave-2 look.
// LIFTED (vis-hoops-court, owner 2026-10-14 "Go on hoops"): onevone, threevthree and carnival (and the older names 'basketball', 'hoops1v1' and
// 'hoops3v3' for 1v1 and 3v3) take the wave-2 look: fixture lights, the sky and air, the glossy floor, decals, the wet surface and the sweat
// reach them. Checked on the rig, 1080p desktop: nothing looked wrong on any of the three, so no single system is held for them (a system
// that did would be held per mode, with its reason, in this file).
// ALL SIX LIFTED (tp-shadow-fix merge, coordinator 2026-10-14): both hoops lanes' lifts together leave no hoops mode held, and with them
// 'basketball_h2h', the ones-court id the 1v1 and 3-Point hosts pass (neither lane removed it; holding it would hold those hosts). The set
// stays, empty, as the mechanism: a system that looks wrong on a mode is held here for that mode, with its reason. The look's own tests
// hold a synthetic id (tests/helpers/heldMode.ts).

/** Modes held out of the wave-2 shared look. Empty: every hoops mode has been lifted (see above). */
export const WAVE2_HELD_MODES: ReadonlySet<string> = new Set<string>([]);

/** Pure: does this mode take the wave-2 shared look? An unknown mode (a preview, a test scene) does. */
export function wave2Look(modeId: string | null | undefined): boolean {
  return !modeId || !WAVE2_HELD_MODES.has(modeId);
}

/** The mounted mode's id, as the harness records it on the scene (ModeHarness: scene.metadata.felModeId). */
export function sceneModeId(scene: { metadata?: unknown }): string | null {
  const m = scene.metadata as { felModeId?: unknown } | null | undefined;
  return typeof m?.felModeId === 'string' ? m.felModeId : null;
}
