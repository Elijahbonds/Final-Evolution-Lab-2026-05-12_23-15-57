// RUNUP-STALL-2 (2026-10-30): compile the scene's shaders ahead of play. AM's gate on c9e199db saw Babylon's shader
// preprocessor (160 + 90 ms) inside dunk 3's landing and replay: the first frame a material/mesh pairing (a body's skinned
// variant, a crowd LOD, the slam's particles) is drawn, its effect is built then. forceCompilationAsync builds it now.
//
// RUNUP-STALL-3 (2026-10-30): each mesh compiles in its REAL state. forceCompilationAsync(mesh) alone defaults
// useInstances to false, so the INSTANCES define is off; but Babylon still sets INSTANCESCOLOR from the mesh itself
// (materialHelper.functions.js: an `instanceColor` buffer + instances/thin instances), and `instanceColor` is declared only
// inside `#ifdef INSTANCES` (instancesDeclaration) — "'instanceColor' : undeclared identifier", twice, on AM's 4c95bc64
// gate. An instanced mesh now compiles with useInstances: true (the variant it really draws with), and an InstancedMesh
// entry is skipped (it draws with its source mesh's effect). And the compiles are spread over frames, a batch at a time.
import type { AbstractMesh, Scene } from '@babylonjs/core';

/** How many mesh-material pairs are asked for per frame when a frame clock is given (each is one effect build at most). */
export const WARM_BATCH = 6;

export interface WarmOpts {
  /** Schedules a callback for the next frame; with it the pairs are compiled WARM_BATCH (or `batch`) per frame. */
  nextFrame?: (cb: () => void) => void;
  batch?: number;
  /** Called after each batch with the pairs done and the total. */
  onBatch?: (done: number, total: number) => void;
}

type Instanceable = AbstractMesh & { hasInstances?: boolean; hasThinInstances?: boolean; sourceMesh?: unknown };

/** The mesh as it draws: true for a mesh with instances or thin instances (its effect is the instanced variant). */
export function drawsInstanced(mesh: AbstractMesh): boolean {
  const m = mesh as Instanceable;
  return !!(m.hasInstances || m.hasThinInstances);
}

/** An InstancedMesh: it has no effect of its own (its source mesh's instanced effect draws it). */
export function isInstanceEntry(mesh: AbstractMesh): boolean {
  return (mesh as Instanceable).sourceMesh != null;
}

/** Every real mesh-material pair in the scene compiled in its drawn state (disabled and hidden meshes too: a replay or a
 *  cut can show them). Resolves with the number of pairs asked for; a pair that fails to compile is skipped (the draw will
 *  build it, as before). */
export async function warmSceneShaders(scene: Scene, meshes: readonly AbstractMesh[] = scene.meshes, opts: WarmOpts = {}): Promise<number> {
  // the scene's own frame clock when it has one (a game scene always does): WARM_BATCH pairs a frame
  const obs = (scene as { onBeforeRenderObservable?: { addOnce(cb: () => void): unknown } }).onBeforeRenderObservable;
  opts = { ...opts, nextFrame: opts.nextFrame ?? (obs ? (cb) => { obs.addOnce(cb); } : undefined) };
  const pairs = meshes.filter((mesh) => !!mesh.material && !mesh.isDisposed() && !isInstanceEntry(mesh));
  const batch = Math.max(1, opts.batch ?? WARM_BATCH);
  let asked = 0;
  for (let i = 0; i < pairs.length; i += opts.nextFrame ? batch : pairs.length) {
    const jobs: Promise<unknown>[] = [];
    for (const mesh of pairs.slice(i, opts.nextFrame ? i + batch : pairs.length)) {
      try { jobs.push(mesh.material!.forceCompilationAsync(mesh, { useInstances: drawsInstanced(mesh) }).catch(() => undefined)); asked++; }
      catch { /* a material without the API: the draw builds it */ }
    }
    await Promise.all(jobs);
    opts.onBatch?.(Math.min(pairs.length, i + (opts.nextFrame ? batch : pairs.length)), pairs.length);
    if (opts.nextFrame && i + batch < pairs.length) await new Promise<void>((r) => opts.nextFrame!(r));
  }
  return asked;
}
