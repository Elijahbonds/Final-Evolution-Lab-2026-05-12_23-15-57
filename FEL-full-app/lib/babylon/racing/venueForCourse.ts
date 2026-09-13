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

import type { Scene, TransformNode } from '@babylonjs/core';
import { TransformNode as TN } from '@babylonjs/core';
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
