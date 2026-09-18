// VEHICLE SHAPES — the primitives a kart and an aircraft are both made of (2026-09-13).
//
// Owner: "we need to do a visual upgrades on the karts and planes."
//
// Both vehicles shipped as flat boxes and photographed exactly like that — a white slab with rectangular
// wings, a pink brick on four cylinders. On a vehicle seen in silhouette the silhouette IS the art, so the
// work goes into shape rather than into decals, and these are the two shapes that do almost all of it.
//
// THE TAPER TRICK, because it is not obvious from the Babylon API: there is no tapered box. `CreateCylinder`
// with `tessellation: 4` is a four-sided prism, and giving it a different top and bottom diameter makes that
// prism TAPERED. Lay it on its side and flatten one axis and you have a wing with a root chord, a tip chord
// and a thickness — or a kart's nose cone, or a side pod — for one draw call and no mesh data.
//
// Shared by both racing modes rather than copied into each, so a fix to the geometry cannot land in one
// vehicle and not the other.

import { MeshBuilder } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';

/**
 * A tapered plank: root at the ORIGIN, tip at +X.
 *
 * The root placement is the whole contract and the first version got it wrong. A centred cylinder baked flat
 * leaves the root at −X for both sides, so mirroring a pair by position alone mounts the left one TIP FIRST
 * — photographed on the aircraft, the left wing tapered the wrong way and the whole plane was visibly
 * lopsided. With the root at the origin, a pair is placed at the body skin and mirrored with `scaling.x =
 * -1`, which cannot be asymmetric by construction.
 */
export function taperedPlank(
  scene: Scene, name: string,
  span: number, rootChord: number, tipChord: number, thickness: number,
): Mesh {
  const m = MeshBuilder.CreateCylinder(name, {
    height: span, diameterBottom: rootChord, diameterTop: tipChord, tessellation: 4,
  }, scene);
  m.rotation.z = -Math.PI / 2;      // +Y (the tip) maps to +X
  m.position.x = span / 2;          // and the root lands on the origin
  m.bakeCurrentTransformIntoVertices();
  m.scaling.y = thickness / Math.max(rootChord, tipChord);
  return m;
}

/**
 * A tapered body section pointing along +Z — a nose cone, a tail cone, a bodywork fairing.
 *
 * `flip` points it the other way while keeping the WIDE end at the origin, which is the end that has to meet
 * the body. Getting that backwards is what turned the aircraft's tail into a funnel opening out behind it.
 */
export function taperedSection(
  scene: Scene, name: string,
  length: number, rootDia: number, tipDia: number, sides = 14, flip = false,
): Mesh {
  const m = MeshBuilder.CreateCylinder(name, {
    height: length, diameterBottom: rootDia, diameterTop: tipDia, tessellation: sides,
  }, scene);
  m.rotation.x = -Math.PI / 2;
  if (flip) m.scaling.z = -1;
  return m;
}

/**
 * A road wheel: a dark tyre with a lighter rim face, as one parented pair.
 *
 * A wheel that is a single flat cylinder reads as a disc, and at speed a disc reads as nothing at all. The
 * rim is what gives it a centre to rotate around and the only reason wheels look like wheels from a chase
 * camera.
 */
export function roadWheel(
  scene: Scene, name: string, diameter: number, width: number,
  tyre: Mesh['material'], rim: Mesh['material'],
): Mesh {
  const t = MeshBuilder.CreateCylinder(name, { diameter, height: width, tessellation: 16 }, scene);
  t.rotation.z = Math.PI / 2;
  t.material = tyre;
  const r = MeshBuilder.CreateCylinder(`${name}_rim`, { diameter: diameter * 0.58, height: width * 1.04, tessellation: 12 }, scene);
  r.material = rim;
  r.parent = t;
  return t;
}
