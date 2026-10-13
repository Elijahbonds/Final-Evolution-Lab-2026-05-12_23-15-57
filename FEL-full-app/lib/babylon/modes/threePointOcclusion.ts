// CAM-FIXES (2026-10-13): what stands between the 3-Point camera and the rim.
//
// MEASURED (Playwright on the running rig, scratch cam-fixes): once a corner rack's camera could stand where the 'hoops' preset wants it
// (x +-11.8, see CAM_BOUNDS_RECT in ThreePointMode), it stands INSIDE the court location's trees. Blossom Park and Canopy Court ring the
// court with trees at x +-11 (courtLocations.COURT_TREE_SPOTS), and the nearest ones sit on the corner camera's line to the rim: a pink
// canopy filled the left half of a portrait frame and the hoop was behind it for 41 of 41 sampled frames at rack 1.
// CameraDirector's own occlusion probe only sees venue-shell / collision meshes, never decor, so it cannot help.
//
// The answer is the one every third-person camera gives foliage: the leaf that is in the way goes see-through. Pure geometry here so a
// unit test can hold it; ThreePointMode owns the meshes and calls it once a frame. Nothing moves, nothing is deleted and no gameplay
// number changes: a head or trunk fades while the camera is in it or its sphere crosses the camera's line to the rim or the shooter, and
// comes back (slower than it went) when the line is clear.

export interface Pt { x: number; y: number; z: number }
export interface Sphere extends Pt { r: number }

/** Distance from `s`'s centre to the segment a-b, minus its radius: negative = the segment pierces the sphere. */
export function segmentSphereGap(a: Pt, b: Pt, s: Sphere): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 1e-9 ? ((s.x - a.x) * dx + (s.y - a.y) * dy + (s.z - a.z) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + dx * t - s.x, py = a.y + dy * t - s.y, pz = a.z + dz * t - s.z;
  return Math.hypot(px, py, pz) - s.r;
}

/** How far a sphere's skin may sit from the camera's line before it counts as in the way (m). A frame is wider than a line. */
export const FADE_LINE_PAD = 0.9;
/** How close the camera may get to a sphere's skin before it is "in the foliage" (m). */
export const FADE_CAM_PAD = 1.1;
/** Fade out / back in, as a fraction of full opacity per second. Out is quick (a leaf must not cover a shot), in is slow (no flicker). */
export const FADE_OUT_PER_SEC = 7;
export const FADE_IN_PER_SEC = 1.6;
/** The most a faded leaf hides: fully invisible reads as a hole in the tree, so a ghost is left. */
export const FADE_FLOOR = 0.04;

/** True when `s` should be see-through: the camera is in/at it, or it crosses the camera's line to any of `focus` (the rim, the shooter). */
export function shouldFade(cam: Pt, focus: readonly Pt[], s: Sphere): boolean {
  if (Math.hypot(cam.x - s.x, cam.y - s.y, cam.z - s.z) < s.r + FADE_CAM_PAD) return true;
  for (const f of focus) if (segmentSphereGap(cam, f, s) < FADE_LINE_PAD) return true;
  return false;
}

/** One frame of the fade: `v` (1 = solid) toward FADE_FLOOR when `fade`, back toward 1 when not. */
export function stepVisibility(v: number, fade: boolean, dt: number): number {
  const step = Math.max(0, Math.min(0.1, dt));   // a stalled frame must not flip the whole tree
  return fade ? Math.max(FADE_FLOOR, v - FADE_OUT_PER_SEC * step) : Math.min(1, v + FADE_IN_PER_SEC * step);
}

/** Decor a location plants around the court (trees; see courtLocations.plantTrees) — and nothing else: the venue shell, the hoop and the
 *  court are never faded. Name-matched, like the director's own VENUE_SHELL. */
export const FADEABLE_DECOR = /^loc_(blossom|canopy)_(trunk|head)_/;

// ── the meshes: collect a location's decor once, fade it every frame ──────────────────────────────────────────────────────────────────
import type { AbstractMesh } from '@babylonjs/core';

/** One faded-able mesh: its world bounding sphere (the decor is static, so it is read once) and its current visibility. */
export interface FadeLeaf { mesh: Pick<AbstractMesh, 'visibility' | 'name'>; s: Sphere; v: number }

/** The location decor in `meshes` (FADEABLE_DECOR by name), as leaves. Reads each world bounding sphere once. */
export function collectFadeLeaves(meshes: readonly AbstractMesh[]): FadeLeaf[] {
  const out: FadeLeaf[] = [];
  for (const m of meshes) {
    if (!FADEABLE_DECOR.test(m.name) || m.getTotalVertices() === 0) continue;
    m.computeWorldMatrix(true);
    const bs = m.getBoundingInfo().boundingSphere;
    out.push({ mesh: m, s: { x: bs.centerWorld.x, y: bs.centerWorld.y, z: bs.centerWorld.z, r: bs.radiusWorld }, v: m.visibility });
  }
  return out;
}

/** One frame: every leaf toward see-through or solid for the camera at `cam` looking at `focus`. Writes `mesh.visibility` only when it moved. */
export function updateFade(leaves: readonly FadeLeaf[], cam: Pt, focus: readonly Pt[], dt: number): void {
  for (const l of leaves) {
    const v = stepVisibility(l.v, shouldFade(cam, focus, l.s), dt);
    if (v !== l.v) { l.v = v; l.mesh.visibility = v; }
  }
}
