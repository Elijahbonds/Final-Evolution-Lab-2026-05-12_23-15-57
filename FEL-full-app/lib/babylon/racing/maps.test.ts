// THE MAPS ARE DRIVABLE, AND THEY ARE DIFFERENT FROM EACH OTHER (2026-09-13).
//
// Owner asked for a map pass on both racing modes, with the maps drawn from FEL's existing worlds. A list of
// coordinates always LOOKS like a track. These are the two things that make it one:
//
//   1. the gates can actually be passed in order, going forward, from the start — checked by flying/driving
//      a simple autopilot round the thing, because the failure this catches is real and has happened here
//      before (a hand-written gate facing pointed back against the flow and an autopilot sat on gate 2 for
//      110 seconds).
//   2. the courses ask DIFFERENT questions. Four tracks that are all the same shape are one track with four
//      names, and the garage's trade-offs only mean something if some course rewards grip and another
//      rewards top speed.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  AERO_COURSES, KART_COURSES, coursesFor, readyCourses, courseById, courseLength, tightestCorner,
  startRace, stepRace, onTrack, distToTrack, TRACK_HALF_WIDTH, type Course,
} from '../core/RaceCourse';
import { KARTS } from './garage';

const ALL = [...AERO_COURSES, ...KART_COURSES];

/**
 * Drive the racing line: straight from the start to gate 0, then gate to gate, in small steps.
 *
 * Deliberately dumb. It is not testing an AI, it is testing that the COURSE can be completed by something
 * that follows its own centre line — if that fails, no player can do it either.
 */
function runTheLine(course: Course, stepM = 4): { finished: boolean; laps: number; steps: number } {
  const p = startRace();
  let at = course.start.at.clone();
  let steps = 0;
  const limit = 40000;
  while (!p.finished && steps < limit) {
    const target = course.gates[Math.min(p.next, course.gates.length - 1)].at;
    const to = target.subtract(at);
    const d = to.length();
    const move = Math.min(stepM, Math.max(0.5, d));
    const next = d > 1e-6 ? at.add(to.scale(move / d)) : at.clone();
    stepRace(p, course, at, next, move / 40);
    at = next;
    steps++;
  }
  return { finished: p.finished, laps: p.lap, steps };
}

describe('EVERY COURSE CAN BE COMPLETED', () => {
  it.each(ALL.map((c) => [c.id, c] as const))('%s — the racing line finishes it', (_id, course) => {
    const r = runTheLine(course);
    expect(r.finished, `${course.id} never finished after ${r.steps} steps`).toBe(true);
  });

  it('a course cannot be finished by going BACKWARDS through its gates', () => {
    // the direction rule is what stops a course being cheated by reversing through the same gate
    for (const course of ALL) {
      const p = startRace();
      const gate = course.gates[0];
      const behind = gate.at.add(gate.through.scale(6));
      const front = gate.at.subtract(gate.through.scale(6));
      const r = stepRace(p, course, behind, front, 0.1);     // crossing the wrong way
      expect(r.gate, course.id).toBe(false);
    }
  });

  it('THE START IS BEHIND GATE 0\u2019S PLANE — the bug Boardwalk Loop shipped with', () => {
    // A gate is passed only by crossing its plane from behind, so a start that sits ON or PAST that plane
    // makes the first gate unpassable and the course unfinishable. It is invisible on a map: the gate is in
    // the right place, the facing is correctly derived, and the start is sensibly behind it in space — the
    // plane is just perpendicular to the way you arrive. Two courses shipped this way. Never again.
    for (const course of ALL) {
      const gate = course.gates[0];
      const d = Vector3.Dot(course.start.at.subtract(gate.at), gate.through);
      expect(d, `${course.id} start is ${d.toFixed(1)} along gate 0's facing`).toBeLessThan(-1);
    }
  });

  it('the start line is ON the road, so nobody begins off-track', () => {
    for (const course of KART_COURSES) {
      expect(distToTrack(course.start.at, course), course.id).toBeLessThanOrEqual(TRACK_HALF_WIDTH);
      expect(onTrack(course.start.at, course), course.id).toBe(true);
      // and so is every gate, which is the same promise from the other end
      for (const [i, gate] of course.gates.entries()) {
        expect(onTrack(gate.at, course), `${course.id} gate ${i}`).toBe(true);
      }
    }
  });
});

describe('the courses ask different questions', () => {
  it('seven kart courses and five aero circuits, all ready, with unique ids', () => {
    // three THEMED CIRCUITS in the air (2026-09-15) + the caldera and the skyline; three more kart courses (MAP EXPANSION, 2026-09-18)
    for (const [kind, n] of [['aero', 5], ['kart', 7]] as const) {
      const list = readyCourses(kind);
      expect(list.length, kind).toBe(n);
      expect(new Set(list.map((c) => c.id)).size, kind).toBe(n);
      expect(new Set(list.map((c) => c.name)).size, kind).toBe(n);
      for (const c of list) expect(c.kind, c.id).toBe(kind);
    }
  });

  it('they are set in different worlds and lit differently', () => {
    for (const kind of ['aero', 'kart'] as const) {
      const list = readyCourses(kind);
      // not all the same venue, and not all the same mood — otherwise it is one map with four layouts
      expect(new Set(list.map((c) => c.venue)).size, `${kind} venues`).toBeGreaterThan(1);
      expect(new Set(list.map((c) => c.mood)).size, `${kind} moods`).toBeGreaterThan(1);
    }
  });

  it('KART COURSES SPAN THE GRIP LIMIT — some can be held, one cannot', () => {
    // v²/grip for the starter kart: the tightest corner it can take without sliding.
    const starter = KARTS[0].spec;
    const limit = (starter.vMax * starter.vMax) / starter.grip;
    const corners = KART_COURSES.map((c) => ({ id: c.id, r: tightestCorner(c) }));
    // at least one course is drivable on grip throughout — the drift there is a decision
    expect(corners.some((c) => c.r >= limit * 0.8), JSON.stringify(corners)).toBe(true);
    // and at least one is not — the drift there is the premise, and the picker says so
    expect(corners.some((c) => c.r < limit * 0.6), JSON.stringify(corners)).toBe(true);
    // the one that cannot be held is one whose copy promises exactly that (the rooftop, or the summit's switchbacks)
    const tightest = corners.reduce((a, b) => (b.r < a.r ? b : a));
    expect(['rooftop-circuit', 'summit-climb']).toContain(tightest.id);
    expect(courseById(tightest.id)!.sub.toLowerCase()).toContain('slide');
    expect(courseById('rooftop-circuit')!.sub.toLowerCase()).toContain('slide');
  });

  it('and they are not all the same length', () => {
    for (const kind of ['kart'] as const) {
      const lens = coursesFor(kind).map((c) => courseLength(c));
      expect(Math.max(...lens) / Math.min(...lens), kind).toBeGreaterThan(1.2);
    }
  });

  it('every gold time is beatable in principle at the vehicle’s top speed', () => {
    // a gold nobody can reach is not a target, it is a taunt. The floor is the racing line at top speed,
    // which no real lap achieves — so the gold must sit ABOVE it, with room for corners.
    for (const c of KART_COURSES) {
      const floor = (courseLength(c) * c.laps) / KARTS[0].spec.vMax;
      expect(c.gold, `${c.id} gold ${c.gold} vs floor ${floor.toFixed(1)}`).toBeGreaterThan(floor);
      expect(c.gold, `${c.id} gold is too generous to chase`).toBeLessThan(floor * 2.6);
    }
  });
});

describe('aero circuits are laps through a place', () => {
  // The ring courses asked for rings high in open sky; a Diddy Kong Racing circuit is flown LOW through a place, three
  // laps, with checkpoints the player never has to aim at. aeroCircuits.test.ts holds the geometry.
  it('every aero course is a three-lap loop', () => {
    for (const c of AERO_COURSES) { expect(c.loop, c.id).toBe(true); expect(c.laps, c.id).toBe(3); }
  });

  it('checkpoints are spread along the lap, never stacked', () => {
    for (const c of AERO_COURSES) {
      for (let i = 0; i < c.gates.length; i++) {
        const j = (i + 1) % c.gates.length;
        expect(Vector3.Distance(c.gates[i].at, c.gates[j].at), `${c.id} ${i}/${j}`).toBeGreaterThan(60);
      }
    }
  });
});
