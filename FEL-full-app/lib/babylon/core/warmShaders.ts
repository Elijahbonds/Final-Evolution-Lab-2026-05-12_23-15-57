// RUNUP-STALL-2 (2026-10-30): compile the scene's shaders ahead of play. AM's gate on c9e199db saw Babylon's shader
// preprocessor (160 + 90 ms) inside dunk 3's landing and replay: the first frame a material/mesh pairing (a body's skinned
// variant, a crowd LOD, the slam's particles) is drawn, its effect is built then. forceCompilationAsync builds it now.
import type { AbstractMesh, Scene } from '@babylonjs/core';

/** Every mesh-material pair in the scene compiled (disabled and hidden meshes too: a replay or a cut can show them). Resolves
 *  with the number of pairs asked for; a pair that fails to compile is skipped (the draw will build it, as before). */
export async function warmSceneShaders(scene: Scene, meshes: readonly AbstractMesh[] = scene.meshes): Promise<number> {
  const jobs: Promise<unknown>[] = [];
  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!mat || mesh.isDisposed()) continue;
    try { jobs.push(mat.forceCompilationAsync(mesh).catch(() => undefined)); } catch { /* a material without the API: the draw builds it */ }
  }
  await Promise.all(jobs);
  return jobs.length;
}
