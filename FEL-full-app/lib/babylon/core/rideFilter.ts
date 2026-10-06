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

/**
 * IMPROVE (2026-10-06, snow item 16): THE RIDER'S RAY, REUSED. The snow mode cast three downward rays a frame against the same
 * ground list — the Rider's, BoardPhysics.sampleSlope's and SnowShadow's — at points a few centimetres apart. A ray from
 * `fromAbove` metres over (x, y, z), `length` long, would find exactly the surface `hit` found when that surface lies inside its
 * span (the Rider's ray starts higher, and the first surface below a higher origin that is also below the lower origin is the
 * first surface below the lower one) and the hit is still under the point (`maxOffset` across: the mode moves the rider after
 * the Rider's ray — the edge clamp, a solid's push-out). Then this returns the surface's height AT (x, z) (planar, along the
 * hit's normal); otherwise null and the caller casts its own ray, as before.
 */
export function groundYUnder(
  hit: { pickedPoint: { x: number; y: number; z: number } | null; getNormal(useWorld?: boolean, useVerticesNormals?: boolean): { x: number; y: number; z: number } | null } | null | undefined,
  x: number, y: number, z: number, fromAbove: number, length: number, maxOffset = 0.5,
): { y: number; normal: { x: number; y: number; z: number } } | null {
  const p = hit?.pickedPoint;
  if (!hit || !p) return null;
  const dx = x - p.x, dz = z - p.z;
  if (dx * dx + dz * dz > maxOffset * maxOffset) return null;
  const n = hit.getNormal(true, true);
  if (!n) return null;
  const ny = n.y < 0 ? -n.y : n.y, nx = n.y < 0 ? -n.x : n.x, nz = n.y < 0 ? -n.z : n.z;
  if (ny < 0.2) return null;   // a near-vertical face: no height to carry across
  const gy = p.y - (nx * dx + nz * dz) / ny;
  const top = y + fromAbove;
  if (gy > top || gy < top - length) return null;
  return { y: gy, normal: { x: nx, y: ny, z: nz } };
}
