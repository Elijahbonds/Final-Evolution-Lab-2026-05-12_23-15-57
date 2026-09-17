// A course is only a course if the gates must be taken in order, cannot be cheated, and cannot be MISSED by
// going fast. That last one is the whole reason the test is swept.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  AERO_COURSES, KART_COURSES, courseById, passedGate, startRace, stepRace, toNextGate, medalFor,
  distToSegment, distToTrack, onTrack, TRACK_HALF_WIDTH,
  type Course, type Gate,
} from './RaceCourse';

const ring: Gate = { at: new Vector3(0, 100, 0), through: new Vector3(0, 0, 1), radius: 20 };

describe('the maps', () => {
  it('there are aero courses and kart courses, each with gates', () => {
    expect(AERO_COURSES.length).toBeGreaterThan(0);
    expect(KART_COURSES.length).toBeGreaterThan(0);
    for (const c of [...AERO_COURSES, ...KART_COURSES]) {
      expect(c.gates.length).toBeGreaterThan(2);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.sub.length).toBeGreaterThan(10);
      expect(c.gold).toBeGreaterThan(0);
      expect(c.laps).toBeGreaterThan(0);
    }
  });

  it('every gate has a real facing and a positive radius', () => {
    for (const c of [...AERO_COURSES, ...KART_COURSES]) {
      for (const gt of c.gates) {
        expect(gt.radius).toBeGreaterThan(0);
        expect(gt.through.length()).toBeCloseTo(1, 5);
      }
    }
  });

  it('a flying course is not FLAT — the circuit climbs and dives over its ground', () => {
    for (const c of AERO_COURSES) {
      const ys = c.gates.map((gt) => gt.at.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
    }
  });

  it('ids are unique and findable', () => {
    const all = [...AERO_COURSES, ...KART_COURSES];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(courseById(all[0].id)?.id).toBe(all[0].id);
    expect(courseById('nope')).toBeNull();
  });

  it('a looping course declares laps and a point-to-point does not loop', () => {
    // the aero courses are all three-lap circuits now (2026-09-15); the point-to-point is the kart's alpine descent
    const p2p = [...AERO_COURSES, ...KART_COURSES].find((c) => !c.loop);
    expect(p2p).toBeDefined();
    expect(p2p!.laps).toBe(1);
  });
});

describe('passing a gate', () => {
  it('flying through the middle counts', () => {
    expect(passedGate(new Vector3(0, 100, -5), new Vector3(0, 100, 5), ring)).toBe(true);
  });

  it('passing outside the radius does NOT', () => {
    expect(passedGate(new Vector3(40, 100, -5), new Vector3(40, 100, 5), ring)).toBe(false);
  });

  it('crossing it BACKWARDS does not count — a course cannot be cheated by reversing', () => {
    expect(passedGate(new Vector3(0, 100, 5), new Vector3(0, 100, -5), ring)).toBe(false);
  });

  it('not reaching it does not count', () => {
    expect(passedGate(new Vector3(0, 100, -30), new Vector3(0, 100, -10), ring)).toBe(false);
  });

  it('A FAST AIRCRAFT CANNOT MISS IT — the swept test is the whole point', () => {
    // 100 m/s over one 60 Hz frame is 1.7 m, but a teleporting probe jumps much further; either way both
    // endpoints are clear of the ring's plane and a point-in-ring test would see nothing at all
    expect(passedGate(new Vector3(0, 100, -60), new Vector3(0, 100, 60), ring)).toBe(true);
  });

  it('clipping the very edge counts, just', () => {
    expect(passedGate(new Vector3(19.5, 100, -2), new Vector3(19.5, 100, 2), ring)).toBe(true);
    expect(passedGate(new Vector3(20.5, 100, -2), new Vector3(20.5, 100, 2), ring)).toBe(false);
  });

  it('a diagonal crossing is measured where it actually crosses, not at either end', () => {
    // ends 25 m off-centre, but the crossing point is dead middle
    expect(passedGate(new Vector3(-25, 100, -25), new Vector3(25, 100, 25), ring)).toBe(true);
  });
});

describe('the gameplay loop', () => {
  /** A little straight-line course: three gates every 100 m along +z. */
  const course: Course = {
    id: 'test', name: 'TEST', sub: 'a straight line with three gates', kind: 'aero',
    loop: true, laps: 2, gold: 10,
    start: { at: new Vector3(0, 0, -50), heading: 0 },
    gates: [
      { at: new Vector3(0, 0, 0), through: new Vector3(0, 0, 1), radius: 15 },
      { at: new Vector3(0, 0, 100), through: new Vector3(0, 0, 1), radius: 15 },
      { at: new Vector3(0, 0, 200), through: new Vector3(0, 0, 1), radius: 15 },
    ],
  };
  /** Fly from a to b in one step. */
  const hop = (p: ReturnType<typeof startRace>, a: number, b: number) =>
    stepRace(p, course, new Vector3(0, 0, a), new Vector3(0, 0, b), 0.1);

  it('gates count in ORDER — that is what makes it a course and not a field of hoops', () => {
    const p = startRace();
    // jump straight at the SECOND gate: it must not count, because gate one has not been taken
    expect(hop(p, 90, 110).gate).toBe(false);
    expect(p.passed).toBe(0);
    expect(hop(p, -10, 10).gate).toBe(true);
    expect(p.next).toBe(1);
  });

  it('a full set of gates turns the lap over', () => {
    const p = startRace();
    hop(p, -10, 10); hop(p, 90, 110);
    const last = hop(p, 190, 210);
    expect(last.lap).toBe(true);
    expect(p.lap).toBe(2);
    expect(p.next).toBe(0);
  });

  it('finishing the declared laps FINISHES the race', () => {
    const p = startRace();
    for (let lap = 0; lap < 2; lap++) { hop(p, -10, 10); hop(p, 90, 110); hop(p, 190, 210); }
    expect(p.finished).toBe(true);
  });

  it('a finished race ignores further gates', () => {
    const p = startRace();
    for (let lap = 0; lap < 2; lap++) { hop(p, -10, 10); hop(p, 90, 110); hop(p, 190, 210); }
    const after = hop(p, -10, 10);
    expect(after.gate).toBe(false);
    expect(after.finished).toBe(true);
  });

  it('the clock runs', () => {
    const p = startRace();
    for (let i = 0; i < 10; i++) hop(p, -999, -998);
    expect(p.time).toBeCloseTo(1, 5);
  });

  it('a point-to-point course finishes at its last gate without looping', () => {
    const p2p: Course = { ...course, loop: false, laps: 1 };
    const p = startRace();
    stepRace(p, p2p, new Vector3(0, 0, -10), new Vector3(0, 0, 10), 0.1);
    stepRace(p, p2p, new Vector3(0, 0, 90), new Vector3(0, 0, 110), 0.1);
    const last = stepRace(p, p2p, new Vector3(0, 0, 190), new Vector3(0, 0, 210), 0.1);
    expect(last.finished).toBe(true);
    expect(p.lap).toBe(1);
  });

  it('it always knows which gate you are chasing and how far it is', () => {
    const p = startRace();
    const a = toNextGate(p, course, new Vector3(0, 0, -50));
    expect(a.gate).toBe(course.gates[0]);
    expect(a.dist).toBeCloseTo(50, 5);
    hop(p, -10, 10);
    expect(toNextGate(p, course, new Vector3(0, 0, 10)).gate).toBe(course.gates[1]);
  });
});

describe('what the run was worth', () => {
  const c = AERO_COURSES[0];

  it('inside the gold time is a gold', () => {
    expect(medalFor(c, c.gold - 1, true)).toBe('gold');
  });

  it('the medals step down, and a bad time is worth nothing', () => {
    expect(medalFor(c, c.gold * 1.1, true)).toBe('silver');
    expect(medalFor(c, c.gold * 1.4, true)).toBe('bronze');
    expect(medalFor(c, c.gold * 3, true)).toBe('none');
  });

  it('not finishing is worth nothing, however fast you were going', () => {
    expect(medalFor(c, 1, false)).toBe('none');
  });
});

describe('gate facings follow the racing line', () => {
  // Hand-written facings were up to 45 degrees off the path, and on the bay circuit one gate faced back
  // AGAINST the flow: an aircraft arriving the natural way could not legally pass it, and an autopilot sat on
  // that gate for 110 seconds. Facings are derived now, and this is the assertion that keeps them honest.
  // (the aero circuits' checkpoints face the racing line's own tangent — aeroCircuits.test.ts holds them to that)
  it('each hand-authored gate faces roughly from the previous gate toward the next', () => {
    // Only for courses whose gates ARE the shape. On a course derived from a racing line the gates sit ~110 m
    // apart, so the chord from the previous gate to the next is a poor description of "the way the course runs"
    // through a corner — the tangent is the exact one, and that is asserted below instead.
    for (const c of KART_COURSES.filter((x) => !x.path)) {
      if (!c.loop) continue;
      const n = c.gates.length;
      for (let i = 0; i < n; i++) {
        const prev = c.gates[(i - 1 + n) % n].at, next = c.gates[(i + 1) % n].at;
        const flow = new Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
        expect(Vector3.Dot(c.gates[i].through, flow)).toBeGreaterThan(0.9);
      }
    }
  });

  it('each derived gate faces the racing line it was taken from', () => {
    // Stricter than the chord assertion above, not looser: a derived gate's facing IS the line's tangent, so the
    // dot product should be essentially 1. This is the same guarantee aeroCircuits.test.ts holds the air to.
    for (const c of KART_COURSES.filter((x) => x.path)) {
      const path = c.path!;
      for (const gate of c.gates) {
        // nearest sample on the dense line, then the direction the line runs there
        let bi = 0, best = Infinity;
        for (let i = 0; i < path.length; i++) {
          const d = (path[i].x - gate.at.x) ** 2 + (path[i].z - gate.at.z) ** 2;
          if (d < best) { best = d; bi = i; }
        }
        // on a point-to-point course there is nothing after the last sample, so step BACK for the direction
        // instead of wrapping round to the start, which reads the whole course in reverse
        const atEnd = bi >= path.length - 1;
        const a = atEnd && !c.loop ? path[bi - 1] : path[bi];
        const b = atEnd && !c.loop ? path[bi] : path[(bi + 1) % path.length];
        const tangent = new Vector3(b.x - a.x, 0, b.z - a.z).normalize();
        expect(Vector3.Dot(gate.through, tangent), `${c.id}`).toBeGreaterThan(0.97);
      }
    }
  });

  it('a lap taken the natural way passes EVERY gate — the course is actually completable', () => {
    for (const c of [...AERO_COURSES, ...KART_COURSES]) {
      const p = startRace();
      const n = c.gates.length;
      for (let lap = 0; lap < c.laps; lap++) {
        for (let i = 0; i < n; i++) {
          const gt = c.gates[i];
          // arrive along the gate's own facing, which is what flying the line looks like
          const before = gt.at.subtract(gt.through.scale(12));
          const after = gt.at.add(gt.through.scale(12));
          const res = stepRace(p, c, before, after, 0.5);
          if (!p.finished) expect(res.gate, `${c.id} gate ${i} refused a clean pass`).toBe(true);
        }
      }
      expect(p.finished, `${c.id} never finished`).toBe(true);
    }
  });
});

describe('the road, and the rule for being off it', () => {
  const kart = KART_COURSES[0];

  it('distance to a segment is measured to the NEAREST POINT, not to an endpoint', () => {
    const a = new Vector3(0, 0, 0), b = new Vector3(100, 0, 0);
    expect(distToSegment({ x: 50, z: 7 }, a, b)).toBeCloseTo(7, 5);
    // past the end it falls back to the endpoint, which is what a segment means
    expect(distToSegment({ x: 130, z: 0 }, a, b)).toBeCloseTo(30, 5);
  });

  it('the centre line of the course IS the road', () => {
    for (const gt of kart.gates) expect(onTrack(gt.at, kart)).toBe(true);
  });

  it('halfway between two gates is still on the road — the road is the line, not the gates', () => {
    const a = kart.gates[0].at, b = kart.gates[1].at;
    expect(onTrack({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, kart)).toBe(true);
  });

  it('well off the line is off the road', () => {
    expect(onTrack({ x: 400, z: 400 }, kart)).toBe(false);
  });

  it('the start line counts as road, so a kart does not begin in the dirt', () => {
    expect(onTrack(kart.start.at, kart)).toBe(true);
  });

  it('the edge is where the width says it is', () => {
    const a = kart.gates[0].at;
    // step sideways off the first gate, perpendicular to its facing
    const side = new Vector3(-kart.gates[0].through.z, 0, kart.gates[0].through.x);
    const inside = { x: a.x + side.x * (TRACK_HALF_WIDTH - 1), z: a.z + side.z * (TRACK_HALF_WIDTH - 1) };
    const outside = { x: a.x + side.x * (TRACK_HALF_WIDTH + 6), z: a.z + side.z * (TRACK_HALF_WIDTH + 6) };
    expect(onTrack(inside, kart)).toBe(true);
    expect(onTrack(outside, kart)).toBe(false);
  });

  it('distToTrack never returns a NaN, even for silly input', () => {
    for (const p of [{ x: 0, z: 0 }, { x: 1e6, z: -1e6 }, { x: -0, z: 0 }]) {
      expect(Number.isFinite(distToTrack(p, kart))).toBe(true);
    }
  });
});
