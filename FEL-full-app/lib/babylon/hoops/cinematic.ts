// THE BARS FOR A CUT (vis-hoops-dunk). The dunk contest's triple cut is a broadcast replay; the foundation's letterbox
// (visual/Letterbox: DOM bars, no post pass) already eases in over `scene.metadata.felCinematic`, which only the shared
// ReplayDirector wrote. The contest plays its own cut (scene/DunkReplayCam.playCuts, kept as it is), so it asks for the bars here.
// A DOM bar is not a flash, so reduced motion keeps them; the harness eases them in and out.

import type { Scene } from '@babylonjs/core';

/** Ask for the cinematic bars at `level` (0 none .. 1 full). Never lowers a level another caller (a replay) holds when asking for 0 would — it sets only its own. */
export function setCinematic(scene: Scene, level: number): void {
  if (scene.isDisposed) return;
  const md = (scene.metadata ??= {}) as { felCinematic?: number };
  md.felCinematic = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
}
