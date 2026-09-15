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
import { MeshBuilder, PBRMaterial, TransformNode as TN, VertexBuffer } from '@babylonjs/core';
import { groundDetailTexture, DETAIL_TILE_M, type GroundKind } from '../visual/groundTextures';
import { VenueKit } from '../visual/VenueKit';
import { COURT_LOCATIONS } from '../nexus/courtLocations';
import type { Course, CourseVenue } from '../core/RaceCourse';

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
    case 'slope':
      VenueKit.buildSlope(scene);
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
export function buildWorldGround(scene: Scene, course: Course, half = 300): Mesh {
  const surface: Record<CourseVenue, { color: string; detail: GroundKind | null; rough: number }> = {
    park: { color: '#5f8a3e', detail: 'grass', rough: 0.95 },
    slope: { color: '#eef3f8', detail: null, rough: 0.6 },
    pitch: { color: '#3f6f33', detail: 'grass', rough: 0.95 },
    street: { color: '#7c828a', detail: 'concrete', rough: 0.9 },
    orbit: { color: '#2c3a2a', detail: 'grass', rough: 0.95 },
  } as Record<CourseVenue, { color: string; detail: GroundKind | null; rough: number }>;
  const s = surface[course.venue as CourseVenue] ?? surface.park;
  const ground = MeshBuilder.CreateGround('race_world_ground', { width: half * 2, height: half * 2, subdivisions: 1 }, scene);
  ground.position.y = -0.03;
  const mat = VenueKit.paint(scene, `race_world_ground_${course.venue}`, s.color, 0.02, s.rough) as PBRMaterial;
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
