// THE HOOPS FIRST FRAME (lane/hoops-round2, HOP-06; perf-lag #430 owner call: "hoops first frame 1.25-1.75 s").
//
// Measured on the phone rig (esbuild + Playwright, 390x844 DPR 3, 4x CPU, SwiftShader), the release, 3v3, the first playing frame
// profiled between two markers (scratchpad round8/hoops-round2/out/ff-baseP-threevthree.json):
//   - START pressed the instant READY came up (the perf-lag rig's habit): 1109 ms, and the 1.1 s before it began was 820 ms of
//     MAJOR GC — the load's garbage collected on the first press (wake() itself: 8 ms). A person who looks at READY for a second
//     gives V8 that idle time; the rig did not. Not a frame cost of the mode.
//   - the frame itself, profiled: 170 ms against a steady 60. Its extra is the broadcast intro's CRANE: the first frame looks at the
//     whole venue from 13 m up, and every mesh the READY view never drew is checked for the first time on it — material defines
//     rebuilt, effects prepared (isReadyForSubMesh / _prepareEffect / PrepareDefinesForLights ~30 ms), shadow-map passes and the
//     vertex-array records for each.
// So the material and shadow checks are done at the end of load instead (`warmFirstFrame`): Mesh.isReady(true) on every enabled
// mesh prepares its effect per sub-mesh and per shadow generator exactly as the render would (the same instancing flags), and any
// shader it starts compiles during READY. Nothing is drawn, nothing moves, no number in the game changes. The streamed load (the
// court and you first, the rest after: PRF-04) is the perf-load lane's ModeHarness work; hoops adopts it when that lands.
import type { AbstractMesh, Scene } from '@babylonjs/core';

export interface WarmReport { meshes: number; ready: number; ms: number }

/** Prepare every enabled mesh's material and shadow effects now (end of load), not on the first playing frame. */
export function warmFirstFrame(scene: Scene, tag = 'HOOPS'): WarmReport {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  let meshes = 0, ready = 0;
  for (const m of scene.meshes as AbstractMesh[]) {
    if (!m.isEnabled() || !m.isVisible || !m.subMeshes?.length) continue;
    meshes++;
    try { if (m.isReady(true)) ready++; } catch { /* a mesh that cannot answer yet is checked by its first render, as before */ }
  }
  const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  console.info(`[${tag}-LOAD] first-frame warm: ${ready}/${meshes} meshes ready in ${ms.toFixed(0)} ms`);
  return { meshes, ready, ms };
}
