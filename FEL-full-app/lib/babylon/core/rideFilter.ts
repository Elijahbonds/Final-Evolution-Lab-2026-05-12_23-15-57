// rideFilter — the "is this a mesh the board rides on?" predicate the board family's ground rays share.
//
// IMPROVE (2026-10-06): pickWithRay calls its predicate for EVERY mesh in the scene, and the Rider's ray plus
// BoardPhysics.sampleSlope ran `ground.includes(m)` — an O(n) scan over ~50 rideable meshes — inside it, twice a frame,
// each with a fresh closure. One Set per ground list and one predicate, cached on the list itself. A list a world grows
// after the rider was built (its length changes) rebuilds its Set on the next ask, so membership is exactly what
// `includes` answered, for every caller.
import type { AbstractMesh } from '@babylonjs/core';

type Pred = (m: AbstractMesh) => boolean;
const CACHE = new WeakMap<readonly AbstractMesh[], { n: number; pred: Pred }>();

/** The shared predicate for one ground list: `includes` semantics, Set speed, one closure per list. */
export function rideFilter(meshes: readonly AbstractMesh[]): Pred {
  const hit = CACHE.get(meshes);
  if (hit && hit.n === meshes.length) return hit.pred;
  const set = new Set(meshes);
  const pred: Pred = (m) => set.has(m);
  CACHE.set(meshes, { n: meshes.length, pred });
  return pred;
}
