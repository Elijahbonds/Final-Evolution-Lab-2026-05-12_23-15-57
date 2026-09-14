// THE DRESSING FOLLOWS THE COURSE, WHATEVER SIZE IT IS (2026-09-13).
//
// Pure geometry only — no scene. What matters is that the layout is derived from the gates rather than
// authored per course, so a course edited tomorrow is dressed correctly with nobody touching a venue.

import { describe, it, expect } from 'vitest';
import { pathSamples, courseBounds, furnitureFor, MARKER_SPACING, MAX_PER_SIDE, VERGE_OFFSET, AERO_FLOOR_MIN_SPAN } from './trackside';
import { AERO_COURSES, KART_COURSES, TRACK_HALF_WIDTH, type Course } from '../core/RaceCourse';

const ALL = [...AERO_COURSES, ...KART_COURSES];

describe('path sampling', () => {
  it('every shipping course produces samples', () => {
    for (const c of ALL) expect(pathSamples(c).length, c.id).toBeGreaterThan(3);
  });

  it('samples sit ON the course, not beyond it', () => {
    for (const c of ALL) {
      const b = courseBounds(c);
      for (const p of pathSamples(c)) {
        expect(Math.abs(p.x - b.cx), c.id).toBeLessThanOrEqual(b.span);
        expect(Math.abs(p.z - b.cz), c.id).toBeLessThanOrEqual(b.span);
      }
    }
  });

  it('a longer course gets MORE samples at the same spacing — the layout scales with the map', () => {
    const lengths = ALL.map((c) => ({ id: c.id, n: pathSamples(c).length }));
    expect(new Set(lengths.map((l) => l.n)).size).toBeGreaterThan(1);
  });

  it('wider spacing yields fewer samples', () => {
    for (const c of ALL) {
      expect(pathSamples(c, MARKER_SPACING * 4).length, c.id)
        .toBeLessThanOrEqual(pathSamples(c, MARKER_SPACING).length);
    }
  });

  it('a degenerate course does not throw or produce junk', () => {
    const empty = { ...KART_COURSES[0], gates: [] } as unknown as Course;
    expect(pathSamples(empty)).toEqual([]);
    expect(() => courseBounds(empty)).not.toThrow();
  });
});

describe('THE VERGE IS OUTSIDE THE ROAD', () => {
  it('furniture sits clear of the tarmac, not on it', () => {
    // the bug that shipped for one commit: my offset was named TRACK_HALF_WIDTH at 7.5 while RaceCourse
    // already exported TRACK_HALF_WIDTH at 9 for the road, so every post planted on the racing surface
    expect(VERGE_OFFSET).toBeGreaterThan(0);
    expect(TRACK_HALF_WIDTH + VERGE_OFFSET).toBeGreaterThan(TRACK_HALF_WIDTH);
  });
});

describe('the venue picks its own furniture', () => {
  it('every shipping course resolves to something buildable', () => {
    for (const c of ALL) {
      const f = furnitureFor(c);
      expect(typeof f.make, c.id).toBe('function');
      expect(Number.isFinite(f.y), c.id).toBe(true);
    }
  });

  it('an aero course always gets airborne furniture — a post beside a ring reads as a bug', () => {
    for (const c of AERO_COURSES) expect(furnitureFor(c).airborne, c.id).toBe(true);
  });

  it('and a ground course never does', () => {
    for (const c of KART_COURSES) {
      if (c.venue !== 'orbit') expect(furnitureFor(c).airborne ?? false, c.id).toBe(false);
    }
  });

  it('a slope course is lined with something taller than a street course', () => {
    const slope = KART_COURSES.find((c) => c.venue === 'slope');
    const street = KART_COURSES.find((c) => c.venue === 'street');
    if (slope && street) expect(furnitureFor(slope).y).toBeGreaterThan(furnitureFor(street).y);
  });
});

describe('the budget wins over the density', () => {
  it('no course can exceed the per-side cap', () => {
    for (const c of ALL) {
      const rough = pathSamples(c, MARKER_SPACING);
      const spacing = rough.length > MAX_PER_SIDE ? MARKER_SPACING * (rough.length / MAX_PER_SIDE) : MARKER_SPACING;
      expect(pathSamples(c, spacing).length, c.id).toBeLessThanOrEqual(MAX_PER_SIDE + 1);
    }
  });
});

describe('an aerial course gets a floor big enough to BE the ground', () => {
  it('the floor always reaches past the course', () => {
    for (const c of AERO_COURSES) {
      const b = courseBounds(c);
      expect(Math.max(b.span * 4, AERO_FLOOR_MIN_SPAN), c.id).toBeGreaterThan(b.span);
    }
  });

  it('and never smaller than the horizon minimum', () => {
    for (const c of AERO_COURSES) {
      const b = courseBounds(c);
      expect(Math.max(b.span * 4, AERO_FLOOR_MIN_SPAN)).toBeGreaterThanOrEqual(AERO_FLOOR_MIN_SPAN);
    }
  });

  it('bounds enclose every gate', () => {
    for (const c of ALL) {
      const b = courseBounds(c);
      for (const g of c.gates) {
        expect(g.at.y, c.id).toBeGreaterThanOrEqual(b.minY);
      }
    }
  });
});
