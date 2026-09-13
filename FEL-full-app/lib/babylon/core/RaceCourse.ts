// COURSES — the maps and the gameplay loop for Aero Aces and Velocity Kart (2026-09-12).
//
// Owner asked "maps? gameplay?" about both new modes. This is both, for both, in one place, because they are
// the same problem twice: a sequence of things you must pass through in order, a clock, and a rule for being
// off course. Sharing it means a lap means the same thing in the air and on the ground.
//
// The difference between the two is only the shape of a gate:
//   AERO — a RING in the air you fly through. Passing it means crossing its plane inside its radius.
//   KART — a CHECKPOINT across a track. Passing it means crossing its line inside the track width.
//
// Both are "did the segment from where I was to where I am cross this plane inside the gate", which is the same
// swept test BallPhysics uses on a backboard and for the same reason: at 100 m/s an aircraft crosses a ring in
// a third of a frame, so a point-in-ring test would miss almost every gate.
//
// Pure maths. The courses below are DATA, so a new map is a list of gates rather than a code change.

import { Vector3 } from '@babylonjs/core';

export interface Gate {
  /** Centre of the ring, or the middle of the checkpoint line. */
  at: Vector3;
  /** The direction you are meant to be travelling when you pass it — the gate's facing. */
  through: Vector3;
  /** Ring radius, or half the checkpoint width. */
  radius: number;
}

export interface Course {
  id: string;
  name: string;
  /** One line on the picker. */
  sub: string;
  /** 'aero' rings in the air, 'kart' checkpoints on the ground. */
  kind: 'aero' | 'kart';
  gates: Gate[];
  /** Does the last gate lead back to the first? */
  loop: boolean;
  /** Laps to finish. 1 for a point-to-point run. */
  laps: number;
  /** Where you start, and facing where. */
  start: { at: Vector3; heading: number };
  /** Target time for a gold, seconds — the thing worth chasing. */
  gold: number;
}

/** A gate before its facing is known — the path decides that. */
interface GateSpec { x: number; y: number; z: number; r: number }
const g = (x: number, y: number, z: number, r: number): GateSpec => ({ x, y, z, r });

/**
 * Derive each gate's facing from the PATH through it.
 *
 * Gate facings were hand-written at first and it was a mistake: they were up to 45 degrees off the actual
 * racing line, and on the bay circuit gate 2 ended up facing back AGAINST the flow — so an aircraft arriving
 * the natural way could not legally pass it and an autopilot sat on gate 2 for 110 seconds. A gate faces the
 * way you travel through it, which is the direction from the previous gate to the next one; deriving it
 * removes the entire class of error rather than fixing one instance of it.
 */
function withFacings(specs: readonly GateSpec[], loop: boolean): Gate[] {
  return specs.map((sp, i) => {
    const prev = specs[(i - 1 + specs.length) % specs.length];
    const next = specs[(i + 1) % specs.length];
    // ends of a point-to-point course take the direction of their one neighbour
    const from = !loop && i === 0 ? sp : prev;
    const to = !loop && i === specs.length - 1 ? sp : next;
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    const through = len > 1e-6 ? new Vector3(dx / len, 0, dz / len) : new Vector3(0, 0, 1);
    return { at: new Vector3(sp.x, sp.y, sp.z), through, radius: sp.r };
  });
}

/**
 * A ring circuit in the air: a long climb, a descending sweep, and two rings low enough that taking them fast
 * means diving for the speed and pulling out. The gates are deliberately at different HEIGHTS, because a
 * flying course that is flat is just a driving course.
 */
export const AERO_COURSES: readonly Course[] = [
  {
    id: 'bay-circuit', name: 'BAY CIRCUIT', sub: 'Four rings, two heights. Dive for the speed.',
    kind: 'aero', loop: true, laps: 2, gold: 95,
    start: { at: new Vector3(0, 140, -360), heading: 0 },
    gates: withFacings([
      g(0, 150, -120, 26),
      g(260, 230, 140, 24),
      g(0, 90, 330, 22),
      g(-260, 200, 120, 24),
    ], true),
  },
  {
    id: 'canyon-run', name: 'CANYON RUN', sub: 'Point to point, low and fast. No second chances.',
    kind: 'aero', loop: false, laps: 1, gold: 62,
    start: { at: new Vector3(-420, 70, -420), heading: Math.PI * 0.25 },
    gates: withFacings([
      g(-240, 60, -240, 20),
      g(-60, 48, -60, 18),
      g(120, 60, 120, 18),
      g(300, 90, 300, 20),
      g(440, 130, 440, 24),
    ], false),
  },
];

/** A square-ish kart circuit with one long straight worth spending boost on. */
export const KART_COURSES: readonly Course[] = [
  {
    id: 'boardwalk-loop', name: 'BOARDWALK LOOP', sub: 'One long straight. Bank boost in the hairpin.',
    kind: 'kart', loop: true, laps: 3, gold: 78,
    start: { at: new Vector3(0, 0, -90), heading: 0 },
    gates: withFacings([
      g(0, 0, 0, 9),
      g(60, 0, 70, 9),
      g(0, 0, 140, 9),
      g(-60, 0, 70, 9),
    ], true),
  },
];

export function courseById(id: string): Course | null {
  return [...AERO_COURSES, ...KART_COURSES].find((c) => c.id === id) ?? null;
}

/**
 * Did the travel segment prev -> now pass through this gate, going the right way?
 *
 * Swept against the segment, never the single position: at 100 m/s an aircraft crosses a ring in a third of a
 * frame, so a point test would miss nearly every gate. Direction matters too — flying backwards through a ring
 * must not count, or a course can be cheated by reversing through the same gate.
 */
export function passedGate(prev: Vector3, now: Vector3, gate: Gate): boolean {
  const n = gate.through;
  const dPrev = Vector3.Dot(prev.subtract(gate.at), n);
  const dNow = Vector3.Dot(now.subtract(gate.at), n);
  if (!(dPrev < 0 && dNow >= 0)) return false;             // must cross, and in the gate's direction
  const span = dNow - dPrev;
  const t = span > 1e-9 ? -dPrev / span : 0;
  const hit = prev.add(now.subtract(prev).scale(t));
  return Vector3.Distance(hit, gate.at) <= gate.radius;
}

export interface RaceProgress {
  /** Index of the gate we are trying to pass next. */
  next: number;
  lap: number;
  /** Gates passed in total. */
  passed: number;
  /** Seconds since the start. */
  time: number;
  finished: boolean;
}

export function startRace(): RaceProgress {
  return { next: 0, lap: 1, passed: 0, time: 0, finished: false };
}

/**
 * Advance the race.
 *
 * Gates must be taken IN ORDER — that is what makes a course a course rather than a field of hoops. Returns
 * what happened so the mode can bang a drum on a gate and a bigger one on a lap.
 */
export function stepRace(
  p: RaceProgress, course: Course, prev: Vector3, now: Vector3, dt: number,
): { gate: boolean; lap: boolean; finished: boolean } {
  if (p.finished) return { gate: false, lap: false, finished: true };
  p.time += dt;
  const gate = course.gates[p.next];
  if (!gate || !passedGate(prev, now, gate)) return { gate: false, lap: false, finished: false };

  p.passed += 1;
  p.next += 1;
  let lap = false;
  if (p.next >= course.gates.length) {
    if (course.loop) { p.next = 0; p.lap += 1; lap = true; } else p.next = course.gates.length;
    if (p.lap > course.laps || (!course.loop && p.passed >= course.gates.length)) {
      p.finished = true;
      return { gate: true, lap, finished: true };
    }
  }
  return { gate: true, lap, finished: false };
}

/** How far to the gate we are chasing — for an arrow, a HUD distance, or an AI. */
export function toNextGate(p: RaceProgress, course: Course, from: Vector3): { gate: Gate | null; dist: number } {
  const gate = course.gates[p.next] ?? null;
  return { gate, dist: gate ? Vector3.Distance(from, gate.at) : 0 };
}

export type Medal = 'gold' | 'silver' | 'bronze' | 'none';

/** What the run was worth. Silver is the gold time plus a quarter, bronze plus a half. */
export function medalFor(course: Course, seconds: number, finished: boolean): Medal {
  if (!finished) return 'none';
  if (seconds <= course.gold) return 'gold';
  if (seconds <= course.gold * 1.25) return 'silver';
  if (seconds <= course.gold * 1.5) return 'bronze';
  return 'none';
}
