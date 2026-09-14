// TRACKSIDE — the world that follows the racing line (2026-09-13).
//
// From the step-0 visual audit: Velocity Kart renders tarmac, a centre line and a sky, with ABSOLUTELY
// nothing either side; Aero Aces is about 95% empty gradient. They were the two worst frames in the project
// by a distance.
//
// The cause is not that racing forgot to mount a venue — it calls `buildCourseVenue`, which builds a real
// VenueKit world. It is a SCALE MISMATCH. Those worlds are court-sized (tens of metres); a race course is
// hundreds. So the venue is a small island somewhere near the start and the rest of the lap runs off into
// nothing. Building bigger versions of five venues is the expensive answer to that, and the wrong one,
// because the thing a racer actually reads is not scenery — it is the EDGE OF THE ROAD going past.
//
// So this generates dressing along the PATH: markers, barriers and crowd placed from the gates themselves,
// at whatever scale the course happens to be. A course authored twice as long gets twice as much trackside
// without anybody editing a venue.
//
// THREE THINGS IT IS DELIBERATELY NOT:
//
//   · NOT collision. Everything here is scenery; the racing line is still decided by the gates and the
//     surface. A barrier you can hit is a physics feature and wants its own pass with its own tests.
//   · NOT per-course art. It reads the course's own `venue` and `tint`, so a slope course gets pines and a
//     street course gets bollards from one code path.
// EVERY MATERIAL HERE IS PBR (VenueKit.paint), never StandardMaterial. The venues light for PBR —
// hemispheric 0.85 plus a directional at 2.60 — and a StandardMaterial multiplies its diffuse by that and
// clips at white. My first cut used StandardMaterial and the aero floor rendered, sat in frustum, passed
// every check (enabled, unclipped, maxZ 10000, no fog) and was invisible because it had blown out to the
// colour of the sky. VenueKit.paint's own doc names Velocity Kart as the worked example of this exact bug.
//
//   · NOT dense. Instanced, spaced by a real interval in metres, and budgeted — the frame budget is the
//     hard constraint, and a hundred metres of empty road with rhythm reads better than a hundred metres
//     of clutter that costs 8 ms.

import { Color3, MeshBuilder, TransformNode, Vector3, type Mesh, type Scene } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { TRACK_HALF_WIDTH, type Course } from '../core/RaceCourse';

/** Metres between trackside markers. Close enough to read as speed, far enough to stay cheap. */
export const MARKER_SPACING = 14;
/**
 * How far OUTSIDE the road edge the furniture sits.
 *
 * Deliberately not named TRACK_HALF_WIDTH: `RaceCourse` already exports that (9 m, the road itself) and my
 * first version reused the name with a smaller value, which planted every post ON the tarmac. Two constants
 * with one name meaning two things is the same footgun as PLATFORM_TAKE vs PLATFORM_TAKE_RATE, caught here
 * by looking at the screen rather than by the types.
 */
export const VERGE_OFFSET = 3.2;
/** Hard cap on instances per side. A long course gets wider spacing rather than more objects. */
export const MAX_PER_SIDE = 120;

export interface TracksideHandle {
  root: TransformNode;
  /** Instances actually placed, both sides. The audit and the tests read this. */
  count: number;
  dispose(): void;
}

/** How far below the lowest gate the aero floor sits. Far enough to fly under a ring, close enough to read. */
export const AERO_FLOOR_DROP = 26;
/** Floor never smaller than this, whatever the course. One plane costs nothing; a visible horizon is the point. */
export const AERO_FLOOR_MIN_SPAN = 2400;

/** The course's own extent — centre, lowest gate, and the largest planar span. */
export function courseBounds(course: Course): { cx: number; cz: number; minY: number; span: number } {
  const gs = course.gates;
  if (!gs.length) return { cx: 0, cz: 0, minY: 0, span: 200 };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
  for (const g of gs) {
    minX = Math.min(minX, g.at.x); maxX = Math.max(maxX, g.at.x);
    minZ = Math.min(minZ, g.at.z); maxZ = Math.max(maxZ, g.at.z);
    minY = Math.min(minY, g.at.y);
  }
  return {
    cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, minY,
    span: Math.max(120, Math.max(maxX - minX, maxZ - minZ)),
  };
}

/** Points along the course path, resampled at a fixed interval. */
export function pathSamples(course: Course, spacing = MARKER_SPACING): Vector3[] {
  const gates = course.gates;
  if (gates.length < 2) return [];
  const pts: Vector3[] = [];
  const n = gates.length + (course.loop ? 1 : 0);
  for (let i = 0; i < n - 1; i++) {
    const a = gates[i % gates.length].at;
    const b = gates[(i + 1) % gates.length].at;
    const seg = b.subtract(a);
    const len = seg.length();
    if (len < 1e-3) continue;
    const steps = Math.max(1, Math.floor(len / spacing));
    for (let s = 0; s < steps; s++) pts.push(a.add(seg.scale(s / steps)));
  }
  return pts;
}

/** The unit vector across the path at sample `i`, in the ground plane. */
function acrossAt(pts: Vector3[], i: number, loop: boolean): Vector3 {
  const next = pts[(i + 1) % pts.length] ?? pts[i];
  const prev = pts[(i - 1 + pts.length) % pts.length] ?? pts[i];
  const along = (loop || (i > 0 && i < pts.length - 1)) ? next.subtract(prev) : next.subtract(pts[i]);
  along.y = 0;
  const len = along.length();
  if (len < 1e-4) return new Vector3(1, 0, 0);
  along.scaleInPlace(1 / len);
  // the repo's convention: for a facing (fx, fz), the right is (fz, -fx)
  return new Vector3(along.z, 0, -along.x);
}

interface Furniture {
  /** Built once, then thin-instanced along the path. */
  make(scene: Scene, tint: Color3): Mesh;
  /** Height off the ground the instance sits at. */
  y: number;
  /** Aero courses are in the air; their markers hang under the rings instead of beside them. */
  airborne?: boolean;
}

const post = (h: number, r: number): Furniture => ({
  y: h / 2,
  make: (scene, tint) => {
    const m = MeshBuilder.CreateCylinder('ts_post', { height: h, diameterTop: r * 1.6, diameterBottom: r * 2, tessellation: 6 }, scene);
    m.material = VenueKit.paint(scene, 'ts_post_mat', tint.toHexString(), 0.08, 0.7);
    m.isPickable = false;
    return m;
  },
});

const pine = (): Furniture => ({
  y: 3.2,
  make: (scene, tint) => {
    const m = MeshBuilder.CreateCylinder('ts_pine', { height: 6.4, diameterTop: 0, diameterBottom: 2.6, tessellation: 7 }, scene);
    m.material = VenueKit.paint(scene, 'ts_pine_mat', Color3.Lerp(tint, new Color3(0.12, 0.3, 0.18), 0.75).toHexString(), 0.05, 0.9);
    m.isPickable = false;
    return m;
  },
});

const buoy = (): Furniture => ({
  y: 0.5, airborne: true,
  make: (scene, tint) => {
    const m = MeshBuilder.CreateSphere('ts_buoy', { diameter: 1.5, segments: 6 }, scene);
    // a marker in open air wants to glow a little or it vanishes against the sky
    m.material = VenueKit.paint(scene, 'ts_buoy_mat', tint.toHexString(), 0.45, 0.5);
    m.isPickable = false;
    return m;
  },
});

/** What lines this venue's road. One code path; the course's own venue picks the furniture. */
export function furnitureFor(course: Course): Furniture {
  if (course.kind === 'aero') return buoy();
  switch (course.venue) {
    case 'slope': return pine();
    case 'street': return post(1.1, 0.22);      // bollards
    case 'pitch': return post(2.4, 0.16);       // floodlight stems
    case 'orbit': return buoy();
    case 'park': default: return post(1.4, 0.2);
  }
}

/**
 * Dress the course.
 *
 * Thin instances, so a hundred and twenty posts a side is one draw call rather than a hundred and twenty.
 * Spacing widens rather than the count growing once a course is long enough to hit MAX_PER_SIDE — the
 * budget wins over the density, always.
 */
export function buildTrackside(scene: Scene, course: Course): TracksideHandle {
  const root = new TransformNode(`trackside_${course.id}`, scene);

  // AN AERIAL COURSE NEEDS A FLOOR TO BE AERIAL ABOVE.
  //
  // The audit's worst frame: Aero Aces was ~95% empty gradient. Adding markers did not fix it and could not
  // — 202 buoys went in and none of them were visible, because there was nothing behind them. A flying
  // course has no ground at all, so there is nothing to see anything AGAINST, and nothing to judge height
  // or speed by, which makes it a mechanics problem as much as a visual one: altitude is unreadable when
  // the only reference is a gradient.
  //
  // One plane, sized to the course's own bounding box. It is the cheapest possible fix and it is the whole
  // difference between flying and floating.
  if (course.kind === 'aero') {
    const b = courseBounds(course);
    // Sized to reach the HORIZON, not merely to cover the course. Measured on the bay circuit: the floor at
    // span*1.8 was built, visible and 137 m below a camera that simply saw past its edge into sky — a
    // ground plane that stops inside the view distance is not ground, it is a platform.
    const floorSpan = Math.max(b.span * 4, AERO_FLOOR_MIN_SPAN);
    const floor = MeshBuilder.CreateGround('aero_floor', { width: floorSpan, height: floorSpan, subdivisions: 2 }, scene);
    floor.position.set(b.cx, b.minY - AERO_FLOOR_DROP, b.cz);
    const fm = VenueKit.paint(scene, 'aero_floor_mat', '#05161b', 0.0, 1.0);
    // GROUND HAS TO READ AS GROUND, WHICH MEANS NOT THE COLOUR OF THE SKY.
    //
    // My first version lerped the course tint 78% toward dark navy, and the bay circuit's night sky IS dark
    // navy — so the plane built, sat in frustum, passed every check I ran (enabled, not clipped, maxZ
    // 10000, no fog) and was invisible, because I had painted it exactly the colour of the thing behind it.
    // Diagnosed by querying the scene rather than by staring at the screenshot.
    //
    // A deep saturated water/land tone instead, with only a trace of the course tint so venues still differ.
    // FAR darker than looks right in a colour picker, and the reason is measured. The floor was already
    // drawn and already filling the centre of the frame (picking hit it at 318 m dead centre) — it simply
    // read AS SKY, because a mid-value albedo under a 2.60 warm directional plus ACES lifts to roughly the
    // same tone as the sunset behind it. A ground plane only reads as ground when it is clearly DARKER than
    // the horizon, so the albedo is pushed down until it separates rather than until it looks correct
    // unlit. The venue tint survives as a trace so courses still differ.
    fm.albedoColor = Color3.Lerp(new Color3(0.012, 0.045, 0.055), Color3.FromHexString(course.tint), 0.07);
    floor.material = fm;
    floor.isPickable = false;
    floor.parent = root;
  }
  const rough = pathSamples(course, MARKER_SPACING);
  const spacing = rough.length > MAX_PER_SIDE
    ? MARKER_SPACING * (rough.length / MAX_PER_SIDE)
    : MARKER_SPACING;
  const pts = spacing === MARKER_SPACING ? rough : pathSamples(course, spacing);

  if (!pts.length) return { root, count: 0, dispose: () => root.dispose() };

  const tint = Color3.FromHexString(course.tint);
  const kit = furnitureFor(course);
  const src = kit.make(scene, tint);
  src.parent = root;
  src.isVisible = false;
  src.thinInstanceEnablePicking = false;

  const matrices: number[] = [];
  let count = 0;
  for (let i = 0; i < pts.length; i++) {
    const across = acrossAt(pts, i, course.loop);
    for (const side of [-1, 1]) {
      const p = pts[i].add(across.scale((TRACK_HALF_WIDTH + VERGE_OFFSET) * side));
      // an aero course hangs its markers UNDER the ring rather than beside it — there is no ground out
      // there to stand anything on, and a floating post beside a ring reads as a bug
      const y = kit.airborne ? p.y - 2.2 : kit.y;
      matrices.push(
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        p.x, y, p.z, 1,
      );
      count++;
    }
  }
  src.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16);
  src.isVisible = true;

  return {
    root,
    count,
    dispose() { src.dispose(); root.dispose(); },
  };
}
