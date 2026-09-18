// THE WORLD A COURSE IS SET IN (2026-09-13).
//
// Owner: "We need to do a map pass for both the kart and aero modes. Different maps, different vehicles."
//
// RaceCourse names a venue as a KEY because it is maths and data, and the tests run it headless. This is the
// one place that turns the key into a world, shared by both racing modes so a venue never means two different
// things depending on which mode asked.
//
// Every world here already exists. That was the owner's call ("reuse FEL's existing worlds"), and it is also
// the honest one: a purpose-built environment per track is four venue builds, and four half-finished
// environments look far worse than four real ones seen from a new angle.

import type { Mesh, Scene, TransformNode } from '@babylonjs/core';
import { Mesh as BMesh, MeshBuilder, PBRMaterial, TransformNode as TN, VertexBuffer } from '@babylonjs/core';
import { groundDetailTexture, DETAIL_TILE_M, type GroundKind } from '../visual/groundTextures';
import { VenueKit } from '../visual/VenueKit';
import { mountOcean } from '../visual/OceanSurface';
import { COURT_LOCATIONS } from '../nexus/courtLocations';
import type { Course, CourseVenue } from '../core/RaceCourse';

/** The shore of the HARBOR venue: the sea lies south of it (mountOcean's shoreZ), the quay to the north. */
export const HARBOR_SHORE_Z = -124;

/**
 * THE MARINA (MAP EXPANSION, 2026-09-18 — owner: "pay attention to viewpoints and setting"). HARBOR RUN first rode
 * the skate park's shell: a graffiti box at the start and no harbour anywhere. Its own world now — open sea south of
 * the quay (the surf break's ocean, calm), a quay wall with mooring bollards along the shore, boats on the water, a
 * breakwater with a lighthouse off the marina corner, warehouses at the back of the quay and two dock cranes over
 * them. The ocean rides the camera, so it is stepped from a render observer the root owns and takes with it.
 */
function buildHarbor(scene: Scene): TransformNode {
  const root = new TN('race_harbor_root', scene);
  const ocean = mountOcean(scene, { deep: '#12607e', foam: '#eafcff', horizon: '#bfe3ef', shoreZ: HARBOR_SHORE_Z, swell: 0.35, fade: [300, 1600] });
  const obs = scene.onBeforeRenderObservable.add(() => { const cam = scene.activeCamera; if (cam) ocean.update(scene.getEngine().getDeltaTime() / 1000, cam); });
  root.onDisposeObservable.add(() => { scene.onBeforeRenderObservable.remove(obs); ocean.dispose(); });
  const quay = VenueKit.paint(scene, 'harbor_quay_m', '#9a9ea4', 0.04, 0.85);
  const iron = VenueKit.paint(scene, 'harbor_iron_m', '#2a2e33', 0.04, 0.5);
  const hull = VenueKit.paint(scene, 'harbor_hull_m', '#f4f1ea', 0.04, 0.6);
  const hullRed = VenueKit.paint(scene, 'harbor_hull_red_m', '#c0392b', 0.04, 0.6);
  const cabin = VenueKit.paint(scene, 'harbor_cabin_m', '#2f6f9f', 0.04, 0.6);
  const shed = VenueKit.paint(scene, 'harbor_shed_m', '#8f7a66', 0.04, 0.9);
  const roof = VenueKit.paint(scene, 'harbor_roof_m', '#4a4f57', 0.04, 0.8);
  const lamp = VenueKit.paint(scene, 'harbor_lamp_m', '#fff2b0', 1.0, 0.4);
  const crane = VenueKit.paint(scene, 'harbor_crane_m', '#e0a020', 0.04, 0.6);
  const add = (m: Mesh, mat: PBRMaterial, x: number, y: number, z: number, yaw = 0): Mesh => { m.material = mat; m.position.set(x, y, z); m.rotation.y = yaw; m.parent = root; m.isPickable = false; return m; };
  // the quay wall along the shore, a step above the water, and a bollard every 16 m
  add(MeshBuilder.CreateBox('harbor_quay_wall', { width: 640, height: 1.6, depth: 2.4 }, scene), quay, 0, 0.2, HARBOR_SHORE_Z + 1.2);
  for (let x = -288; x <= 288; x += 16) add(MeshBuilder.CreateCylinder(`harbor_bollard_${x}`, { height: 0.9, diameter: 0.5, tessellation: 10 }, scene), iron, x, 1.4, HARBOR_SHORE_Z + 1.2);
  // boats moored off the quay
  const boats: [number, number, number, boolean][] = [[-70, -150, 0.3, false], [-24, -160, -0.5, true], [60, -146, 0.9, false], [118, -164, 0.1, true], [176, -148, -0.8, false], [16, -186, 0.4, true], [-150, -178, 1.2, false], [-210, -150, 0.6, true]];
  for (const [x, z, yaw, red] of boats) {
    add(MeshBuilder.CreateBox(`harbor_hull_${x}`, { width: 7.5, height: 1.6, depth: 2.8 }, scene), red ? hullRed : hull, x, 0.5, z, yaw);
    add(MeshBuilder.CreateBox(`harbor_cabin_${x}`, { width: 2.6, height: 1.5, depth: 2.2 }, scene), cabin, x - Math.cos(yaw) * 1.2, 1.9, z + Math.sin(yaw) * 1.2, yaw);
    add(MeshBuilder.CreateCylinder(`harbor_mast_${x}`, { height: 7, diameter: 0.14 }, scene), iron, x + Math.cos(yaw) * 1.8, 4.2, z - Math.sin(yaw) * 1.8);
  }
  // the breakwater and its lighthouse, off the marina's corner
  add(MeshBuilder.CreateBox('harbor_breakwater', { width: 96, height: 2.4, depth: 7 }, scene), quay, 236, 0.4, -158, -0.55);
  add(MeshBuilder.CreateCylinder('harbor_lighthouse', { height: 20, diameterTop: 4.2, diameterBottom: 5.6, tessellation: 16 }, scene), hull, 266, 10, -176);
  add(MeshBuilder.CreateCylinder('harbor_lighthouse_band', { height: 3, diameter: 5.2, tessellation: 16 }, scene), hullRed, 266, 12, -176);
  add(MeshBuilder.CreateCylinder('harbor_lighthouse_lamp', { height: 2.4, diameter: 3.2, tessellation: 16 }, scene), lamp, 266, 21, -176);
  add(MeshBuilder.CreateCylinder('harbor_lighthouse_cap', { height: 1.6, diameterTop: 0.4, diameterBottom: 4, tessellation: 16 }, scene), iron, 266, 23, -176);
  // warehouses along the back of the quay — every one off the road (the course runs x 0..190, z −104..286)
  const sheds: [number, number, number, number][] = [[-210, 40, 60, 24], [-210, 130, 48, 20], [232, 40, 52, 22], [232, 130, 40, 20], [-150, 250, 70, 26], [204, 290, 56, 18]];
  for (const [x, z, w, d] of sheds) {
    add(MeshBuilder.CreateBox(`harbor_shed_${x}_${z}`, { width: w, height: 9, depth: d }, scene), shed, x, 4.5, z);
    add(MeshBuilder.CreateBox(`harbor_shed_roof_${x}_${z}`, { width: w + 1.6, height: 0.7, depth: d + 1.6 }, scene), roof, x, 9.3, z);
  }
  // two dock cranes on the quay, jibs out over the water
  for (const [x, z] of [[150, -108], [-70, -110]] as [number, number][]) {
    add(MeshBuilder.CreateBox(`harbor_crane_post_${x}`, { width: 2.6, height: 24, depth: 2.6 }, scene), crane, x, 12, z);
    add(MeshBuilder.CreateBox(`harbor_crane_jib_${x}`, { width: 2, height: 1.8, depth: 34 }, scene), crane, x, 24.5, z - 9);
    add(MeshBuilder.CreateBox(`harbor_crane_weight_${x}`, { width: 2.4, height: 3, depth: 4 }, scene), iron, x, 22.5, z + 8);
    add(MeshBuilder.CreateCylinder(`harbor_crane_cable_${x}`, { height: 14, diameter: 0.1 }, scene), iron, x, 17, z - 22);
    add(MeshBuilder.CreateBox(`harbor_crane_hook_${x}`, { width: 3, height: 2.6, depth: 5 }, scene), hullRed, x, 9.4, z - 22);
  }
  // ONE DRAW PER MATERIAL: eighty little meshes pushed the frame past the 1600-draw budget; merged by material they are nine
  const byMat = new Map<PBRMaterial, BMesh[]>();
  for (const m of root.getChildMeshes(true)) { const mat = m.material as PBRMaterial; if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat)!.push(m as BMesh); }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const merged = BMesh.MergeMeshes(list, true, true, undefined, false, false);
    if (merged) { merged.name = `harbor_${mat.name}_merged`; merged.material = mat; merged.parent = root; merged.isPickable = false; merged.freezeWorldMatrix(); }
  }
  return root;
}

/**
 * Build the course's world, and return whatever root the decoration hangs off (null when there is none).
 *
 * The returned node is the mode's to dispose. The VenueKit builders own their own meshes and go with the
 * scene; only the orbit starfield is parented, because it is borrowed from the basketball court locations
 * rather than built here.
 */
export function buildCourseVenue(scene: Scene, course: Course): TransformNode | null {
  switch (course.venue as CourseVenue) {
    case 'park':
      VenueKit.buildPark(scene);
      return null;
    case 'harbor':
      return buildHarbor(scene);
    case 'slope':
      // THE MOUNTAIN IS THE WORLD GROUND (2026-09-18). buildSlope is a 60 × 400 piste in a 12 m tree-painted box; the
      // alpine loops run 340 m across, so the box's walls stood across the road. The relief-following world ground is
      // the snow now, and kartDressing's forest (real pines, thin-instanced, off the road) is the setting.
      return null;
    case 'pitch':
      VenueKit.buildField(scene, 'pitch');
      return null;
    case 'street':
      VenueKit.buildCourt(scene, 'street');
      return null;
    case 'orbit': {
      // the night course borrows the starfield the basketball ORBIT location already paints — a self-
      // contained (scene, root) decorator, so reusing it costs nothing and invents no second starfield.
      // Its dome sets infiniteDistance, so it rides the camera and the 440 m course cannot fly out of it.
      const root = new TN('race_orbit_root', scene);
      VenueKit.buildPark(scene);
      COURT_LOCATIONS.orbit.decorate?.(scene, root);
      return root;
    }
    default:
      VenueKit.buildPark(scene);
      return null;
  }
}

/**
 * THE WORLD UNDER THE WHOLE COURSE (SCORECARD VISUALS, 2026-09-15). A venue builder makes a court-sized island and the
 * trackside dresses the racing line, so anywhere a kart ran wide of the road — and every camera angle that looked past
 * it — showed the empty sky under the world: the rc10 frame review scored the kart 4/10 on frames that were a kart in a
 * pink void. One ground spans the play box (±260 m, the mode's wall) in the venue's own surface, a hair under the
 * venue floor so the two never fight, with the shared detail grain tiled through its UVs (never by scaling the shared
 * texture, which every other floor in the scene reads).
 */
/**
 * The world ground's height under (x, z) for a course with relief, or null for a flat course. The verge (14 m either
 * side of the road) holds the road's height; past it the ground blends into a distance-weighted average of every
 * road sample within 160 m — a MOUNTAINSIDE between two switchback legs rather than the cliff the nearest sample
 * alone made (the summit's chase camera sat under that cliff's overhang); 60 m and further from any road it eases
 * down to the course's low point. Always 1.2 m under the road so the two never fight. The forest stands on this.
 */
export function worldHeightFn(course: Course): ((x: number, z: number) => number) | null {
  const path = course.path;
  if (!path) return null;
  const lowest = Math.min(...path.map((p) => p.y)), highest = Math.max(...path.map((p) => p.y));
  if (highest - lowest <= 3) return null;
  const REACH2 = 160 * 160;
  return (x, z) => {
    let best = Infinity, bestY = lowest, wsum = 0, hsum = 0;
    for (const p of path) {
      const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d2 < best) { best = d2; bestY = p.y; }
      if (d2 < REACH2) { const w = 1 / (d2 + 900); wsum += w; hsum += w * p.y; }
    }
    const d = Math.sqrt(best);
    const blend = wsum > 0 ? hsum / wsum : lowest;
    const t = Math.max(0, Math.min(1, (d - 14) / 26));          // verge → mountainside
    const near = bestY * (1 - t) + blend * t;
    const f = Math.max(0, Math.min(1, (d - 60) / 140)) ** 2;    // mountainside → the valley floor
    return near * (1 - f) + lowest * f - 1.2;
  };
}

export function buildWorldGround(scene: Scene, course: Course, half = 300): Mesh {
  const surface: Record<CourseVenue, { color: string; detail: GroundKind | null; rough: number }> = {
    park: { color: '#5f8a3e', detail: 'grass', rough: 0.95 },
    slope: { color: '#eef3f8', detail: null, rough: 0.6 },
    pitch: { color: '#3f6f33', detail: 'grass', rough: 0.95 },
    street: { color: '#7c828a', detail: 'concrete', rough: 0.9 },
    // the station deck: a lit steel deck, not night grass — the render watchdog read the orbit lap as a BLACK FRAME
    // (a dark ground under a starfield averaged under its luma floor) and failed the mode mid-race
    orbit: { color: '#4a5468', detail: 'concrete', rough: 0.7 },
    harbor: { color: '#8e9298', detail: 'concrete', rough: 0.9 },
    volcano: { color: '#2b2320', detail: null, rough: 0.95 },
    city: { color: '#141c2a', detail: 'concrete', rough: 0.9 },
  } as Record<CourseVenue, { color: string; detail: GroundKind | null; rough: number }>;
  const s = surface[course.venue as CourseVenue] ?? surface.park;
  // A COURSE WITH ELEVATION NEEDS GROUND THAT FOLLOWS IT. One flat plane was right while every kart course sat at
  // y = 0; ALPINE DESCENT now drops 96 m over its run and the rooftops sit 6-18 m up, so a flat plane would leave
  // the road hanging over exactly the pink void this function was written to remove. When the course publishes a
  // path with real relief, the ground is subdivided and lifted to meet it, easing back to the course's low point
  // away from the road so the horizon stays flat.
  const heightAt = worldHeightFn(course);
  const shaped = heightAt !== null;
  // the harbour's ground stops at the quay: the sea takes the rest
  const zMin = course.venue === 'harbor' ? HARBOR_SHORE_Z : -half;
  const ground = MeshBuilder.CreateGround('race_world_ground',
    { width: half * 2, height: half - zMin, subdivisions: shaped ? 96 : 1 }, scene);
  ground.position.set(0, -0.03, (half + zMin) / 2);

  if (heightAt) {
    const pos = ground.getVerticesData(VertexBuffer.PositionKind);
    if (pos) {
      for (let i = 0; i < pos.length; i += 3) pos[i + 1] = heightAt(pos[i], pos[i + 2] + ground.position.z);
      ground.setVerticesData(VertexBuffer.PositionKind, pos, false);
      ground.createNormals(true);
    }
  }
  // the station deck keeps a little glow of its own: under the night rig, 150 m from the nearest light post, a lit
  // deck went to black (the orbit lap's far side was a kart and a lamp post in a void)
  const mat = VenueKit.paint(scene, `race_world_ground_${course.venue}`, s.color, course.venue === 'orbit' ? 0.16 : 0.02, s.rough) as PBRMaterial;
  mat.environmentIntensity = 0.45;
  if (s.detail) {
    try {
      const tex = groundDetailTexture(scene, s.detail);
      tex.hasAlpha = false;
      mat.albedoTexture = tex;
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
      mat.useAlphaFromAlbedoTexture = false;
      const tiles = (half * 2) / DETAIL_TILE_M[s.detail];
      const uv = ground.getVerticesData(VertexBuffer.UVKind);
      if (uv) ground.setVerticesData(VertexBuffer.UVKind, uv.map((v) => v * tiles), false);
    } catch { /* headless: the paint alone */ }
  }
  ground.material = mat;
  ground.receiveShadows = true;
  ground.isPickable = false;
  ground.freezeWorldMatrix();
  return ground;
}
