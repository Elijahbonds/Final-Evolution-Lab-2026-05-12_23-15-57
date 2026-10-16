// phoneTrim — what a phone stops counting as an active mesh (lane/owner-1016, 2026-10-16; owner: "bring Dunk and Karate under
// their phone budgets"). PR #281 found dunk (83 active meshes, budget 81) and karate (89-96, budget 77) over their rows.
//
// THE EMPTY ROOTS. Babylon's glTF loader wraps every model in a synthetic `__root__` Mesh that has no geometry. A Mesh is
// an active mesh whether or not it draws anything, so each loaded prop and each cloned character put one more mesh into
// the frustum pass and the active list (karate: 9 of its 89; dunk: 5 of its 83 — a palm's, the hoop's and the ball's).
// Nothing is drawn for them. `isVisible = false` takes a mesh out of the active list and changes no pixel, and it is not
// inherited (children keep their own visibility), so the model still draws exactly as it did.
//
// WHEN. A cloned character arrives in the middle of play (karate's horde spawns mooks), and a Mesh is announced
// (`onNewMeshAddedObservable`) from its constructor, before a clone has its geometry. So a new mesh is only queued there and
// looked at on the next frame, by which time a clone is whole. Only a mesh NAMED like a loader root (`...__root__` or
// `...__root___c<n>`) with no vertices is ever hidden: a dynamic mesh that is empty for a moment is not touched.
//
// MOBILE TIER ONLY (nothing visible changes on any tier, but the budget rows are the phone's). Desktop and high keep every
// mesh active exactly as before.
import type { Mesh, Observer, Scene } from '@babylonjs/core';

/** A glTF loader's synthetic root, or a clone of one (`__root___c1`, `vb_palm_2___root__`, `meshy_hoop_0___root__`). */
export const LOADER_ROOT = /__root__(?:_c\d*)?$/;

type RootLike = { name: string; isDisposed(): boolean; isVisible: boolean; getTotalVertices(): number; getClassName(): string };

/** Pure: is this mesh an empty loader root that is still counted active? */
export function isEmptyLoaderRoot(m: RootLike): boolean {
  return m.isVisible && !m.isDisposed() && LOADER_ROOT.test(m.name) && m.getClassName() === 'Mesh' && m.getTotalVertices() === 0;
}

/** Hide every empty loader root the scene has now. Returns how many it took out of the active list. */
export function hideEmptyLoaderRoots(scene: Pick<Scene, 'meshes'>): number {
  let n = 0;
  for (const m of scene.meshes) if (isEmptyLoaderRoot(m)) { m.isVisible = false; n++; }
  return n;
}

/**
 * Keep the scene's empty loader roots out of the active list, now and for every mesh added later. A phone only: any other
 * tier gets a no-op. The returned function stops it.
 */
export function installPhoneActiveTrim(scene: Scene, tier: string): () => void {
  if (tier !== 'mobile') return () => {};
  hideEmptyLoaderRoots(scene);
  const pending: Mesh[] = [];
  const added = scene.onNewMeshAddedObservable.add((m) => { if (LOADER_ROOT.test(m.name)) pending.push(m as Mesh); });
  const frame: Observer<Scene> | null = scene.onBeforeRenderObservable.add(() => {
    if (!pending.length) return;
    for (let i = 0; i < pending.length; i++) if (isEmptyLoaderRoot(pending[i])) pending[i].isVisible = false;
    pending.length = 0;
  });
  return () => { scene.onNewMeshAddedObservable.remove(added); scene.onBeforeRenderObservable.remove(frame); pending.length = 0; };
}

/**
 * Half of `all`, rounded up, on a phone; `all` on any other tier. For a crowd of small, distant, unlit pieces (the Venice
 * gulls: one active mesh and one draw each) where a phone keeps the look with fewer of them.
 */
export function phoneHalf(scene: { metadata?: unknown }, all: number): number {
  return (scene.metadata as { felTier?: string } | null)?.felTier === 'mobile' ? Math.ceil(all / 2) : all;
}
