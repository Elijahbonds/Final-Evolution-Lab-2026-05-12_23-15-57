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
import { aeroCircuits } from '../racing/aeroCircuits';
import { kartCircuits } from '../racing/kartCircuits';
import { type RacingLine, tightestCorner as lineTightestCorner } from '../racing/racingLine';

export interface Gate {
  /** Centre of the ring, or the middle of the checkpoint line. */
  at: Vector3;
  /** The direction you are meant to be travelling when you pass it — the gate's facing. */
  through: Vector3;
  /** Ring radius, or half the checkpoint width. */
  radius: number;
}

/**
 * Which of FEL's existing worlds a course is set in.
 *
 * A KEY, not a builder: this file is maths and data, and importing VenueKit here would drag the whole visual
 * layer into something the tests run headless. The mode resolves the key when it mounts (see venueForCourse
 * in the racing modes), which is also the seam that lets a course pick a mood the mode does not hard-code —
 * `mood` on a ModeDefinition may be a GETTER, read at mount, after the course has been picked.
 */
export type CourseVenue = 'park' | 'slope' | 'pitch' | 'street' | 'orbit' | 'canyon' | 'island' | 'glacier';

export interface Course {
  id: string;
  name: string;
  /** One line on the picker. */
  sub: string;
  /** 'aero' rings in the air, 'kart' checkpoints on the ground. */
  kind: 'aero' | 'kart';
  /** The world this course is set in. */
  venue: CourseVenue;
  /** The scene mood the venue is lit with — the same vocabulary every other mode uses. */
  mood: 'goldenHour' | 'daylight' | 'dojoWarm' | 'nightGame' | 'alpine' | 'overcast';
  /** Splash accent for the picker. */
  tint: string;
  gates: Gate[];
  /** Does the last gate lead back to the first? */
  loop: boolean;
  /** Laps to finish. 1 for a point-to-point run. */
  laps: number;
  /** Where you start, and facing where. */
  start: { at: Vector3; heading: number };
  /** Target time for a gold, seconds — the thing worth chasing. */
  gold: number;
  /** Unready courses are authored but hidden from the picker until their pass lands. */
  ready: boolean;
  /**
   * The densely sampled racing line, when the course is derived from one.
   *
   * `gates` are lap logic and sit ~110 m apart; `path` is the shape. Anything asking "where is the road" must use
   * this when it exists, because a polyline through the gates cuts every corner it passes.
   */
  path?: readonly Vector3[];
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
 * Put the start ON the racing line, just before gate 0 — and never anywhere else on a loop.
 *
 * THE BUG THIS REMOVES (found 2026-09-13, shipped in Boardwalk Loop since the mode was built): a gate is
 * passed only by crossing its plane from behind, and gate 0's facing on a loop is derived from the chord
 * between its neighbours. On a symmetric diamond that chord is PERPENDICULAR to the way you arrive from an
 * authored start line — so the start sat exactly ON gate 0's plane, `dPrev < 0` was never true, and the first
 * checkpoint of the course could not be passed by anybody, ever. The race could not begin. Nothing about it
 * looked wrong: the gate was in the right place, the facing was correctly derived, the start was sensibly
 * behind it on the map.
 *
 * Deriving the start from the same geometry that derives the facing removes the whole class rather than the
 * one instance, which is exactly what `withFacings` did for hand-written facings. It also guarantees the
 * start is ON the road, since the racing line IS the road.
 */
function startBefore(gates: readonly Gate[], frac = 0.45): { at: Vector3; heading: number } {
  const first = gates[0].at;
  const last = gates[gates.length - 1].at;
  const at = first.add(last.subtract(first).scale(frac));
  const to = first.subtract(at);
  // Babylon's rotation.y: forward is (sin h, 0, cos h), so the heading that points at gate 0 is atan2(x, z)
  return { at, heading: Math.atan2(to.x, to.z) };
}

/**
 * A ring circuit in the air: a long climb, a descending sweep, and two rings low enough that taking them fast
 * means diving for the speed and pulling out. The gates are deliberately at different HEIGHTS, because a
 * flying course that is flat is just a driving course.
 */

/**
 * THE AERO COURSES ARE THE THEMED CIRCUITS (2026-09-15, owner: Aero Aces "like diddy Kong flyers" — three laps through
 * canyons, islands and caves with a full field, instead of the point-to-point ring race). The four ring courses that
 * lived here (bay circuit, canyon run, alpine gates, orbit ring) were a time trial through hoops in open sky; each
 * circuit is now DERIVED from one racing line in racing/aeroCircuits.ts, and its gates are the invisible lap
 * checkpoints along it. A circuit is data plus its ground and ceiling functions, which is why it lives with the world
 * builder rather than here.
 */
export const AERO_COURSES: readonly Course[] = aeroCircuits().map((c) => c.course);

/**
 * The kart maps.
 *
 * Every one of them is sized against the SAME measured number, because on a kart the size of a corner is the
 * whole game: grip is m/s², so the tightest corner a kart can hold without sliding is v²/a — about 61 m for
 * the starter kart at its 26 m/s top speed. A course whose corners are all tighter than that breaks traction
 * on its OWN, which is what the first boardwalk loop did (a run with drifting DISABLED still logged 516 drift
 * frames), and a drift you cannot avoid is not a choice.
 *
 * So the four courses below deliberately ask different questions of that number, which is also what makes the
 * garage's trade-offs real:
 *
 *   BOARDWALK LOOP    corners near the limit — the balanced course, and the one everything is tuned against
 *   ALPINE DESCENT    point to point, long sweepers — pace, with no second lap to repair a mistake
 *   STADIUM OVAL      two long straights, two big ends — outright top speed, barely a drift on it
 *   ROOFTOP CIRCUIT   every corner inside the limit — you cannot hold it, so the whole lap is the drift
 */
/**
 * THE KART MAPS ARE NOW DERIVED FROM A RACING LINE (racing/kartCircuits.ts), the same way AERO_COURSES is.
 *
 * What lived here was four hand-authored gate tables, which doubled as the road: BOARDWALK LOOP had four gates, so
 * its road was a quadrilateral with four 212 m straight legs. Measured, the four courses were already circuit-sized
 * (748-1046 m a lap against ~1100-1200 m for a real kart circuit) and already 52-56 s a lap at gold, so the problem
 * was never length — it was that a lap had four corners.
 *
 * The grip floor that every comment in this file is built around now lives with the geometry and is TESTED there:
 * each course declares the tightest corner it means to have, and kartCircuits.test.ts measures the built line and
 * fails when a course is tighter than it claims. That is what keeps the drift a choice rather than a tax.
 */
export const KART_COURSES: readonly Course[] = kartCircuits().map((c) => c.course);

export function courseById(id: string): Course | null {
  return [...AERO_COURSES, ...KART_COURSES].find((c) => c.id === id) ?? null;
}

export function coursesFor(kind: 'aero' | 'kart'): readonly Course[] {
  return kind === 'aero' ? AERO_COURSES : KART_COURSES;
}

export function readyCourses(kind: 'aero' | 'kart'): Course[] {
  return coursesFor(kind).filter((c) => c.ready);
}

export const COURSE_KEY_PREFIX = 'fel-race-map-';

/**
 * The player's pick: `?map=` wins, then the remembered pick, then the first ready course.
 *
 * Same order as every other picker in the app (court location, ball, board venue, deck), and for the same
 * reason: the query parameter is what a picker RELOADS with, because the world is built at mount and a new
 * map cannot be swapped under a running scene.
 */
export function readCourse(kind: 'aero' | 'kart'): Course {
  const list = readyCourses(kind);
  const first = list[0] ?? coursesFor(kind)[0];
  try {
    if (typeof window !== 'undefined') {
      // `?course=` is the name both modes already accepted; `?map=` is what the picker writes. Honour both,
      // because a link someone saved before the picker existed should still open the course it names.
      const params = new URLSearchParams(window.location.search);
      const q = params.get('map') ?? params.get('course');
      const byQuery = list.find((c) => c.id === q);
      if (byQuery) return byQuery;
      const s = window.localStorage.getItem(COURSE_KEY_PREFIX + kind);
      const byStore = list.find((c) => c.id === s);
      if (byStore) return byStore;
    }
  } catch { /* private mode: the default */ }
  return first;
}

export function writeCourse(kind: 'aero' | 'kart', id: string): void {
  try { window.localStorage.setItem(COURSE_KEY_PREFIX + kind, id); } catch { /* convenience only */ }
}

/** Total length of the racing line, metres — one lap. */
/** A Course's published path as a RacingLine, so length and corners have ONE definition project-wide. */
function lineFromPath(course: Course): RacingLine | null {
  const pts = course.path;
  if (!pts || pts.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  const closing = course.loop
    ? Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) : 0;
  return { pts: [...pts], cum, length: cum[cum.length - 1] + closing, loop: course.loop };
}

export function courseLength(course: Course): number {
  // A DERIVED COURSE IS AS LONG AS ITS CURVE. Summing the gate legs measures a polygon inscribed in the course
  // and reads short by however much the corners cut — on BOARDWALK LOOP that is most of a hairpin.
  const line = lineFromPath(course);
  if (line) return line.length;

  const gs = course.gates;
  let total = Vector3.Distance(course.start.at, gs[0].at);
  for (let i = 0; i < gs.length; i++) {
    if (!course.loop && i === gs.length - 1) break;
    total += Vector3.Distance(gs[i].at, gs[(i + 1) % gs.length].at);
  }
  return total;
}

/**
 * The tightest corner on the course, metres of radius.
 *
 * Measured as the circle that fits the turn between two straights — for a turn of angle θ between legs of
 * length a and b, the inscribed radius at that vertex is `min(a,b)/2 / tan(θ/2)`. Compared against a kart's
 * v²/grip, this says whether a course can be driven on grip at all, which is the single number that decides
 * whether drifting on it is a decision or a fact of life.
 */
export function tightestCorner(course: Course): number {
  // MEASURE THE ROAD, NOT THE CHECKPOINTS. Derived gates sit ~110 m apart, so the turn between three of them is a
  // property of the lap logic rather than of any corner a driver meets: measured that way ROOFTOP CIRCUIT reads
  // 66 m when its actual tightest corner is 25 m, which would hide the very thing its subtitle promises.
  const line = lineFromPath(course);
  if (line) return lineTightestCorner(line).radius;

  const gs = course.gates;
  let tightest = Infinity;
  const n = gs.length;
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? course.start.at : gs[i - 1].at;
    const next = gs[(i + 1) % n].at;
    if (!course.loop && i === n - 1) break;
    const inV = gs[i].at.subtract(prev); inV.y = 0;
    const outV = next.subtract(gs[i].at); outV.y = 0;
    const a = inV.length(), b = outV.length();
    if (a < 1e-6 || b < 1e-6) continue;
    const cos = Math.max(-1, Math.min(1, Vector3.Dot(inV, outV) / (a * b)));
    const turn = Math.acos(cos);                       // 0 = straight on, π = a hairpin back
    if (turn < 1e-3) continue;                          // a straight has no corner
    tightest = Math.min(tightest, (Math.min(a, b) / 2) / Math.tan(turn / 2));
  }
  return tightest;
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

// ── THE TRACK SURFACE ────────────────────────────────────────────────────────────────────────────────────
// A kart needs something the flyer does not: a road, and a rule for being off it. The road is the polyline
// through the gates, which means the track and the checkpoints can never disagree about where the course goes.

/** Half the road's width, metres. The gates' radius is the same figure, so a gate spans the road exactly. */
export const TRACK_HALF_WIDTH = 9;

/** Shortest distance from a point to the segment a-b, on the floor (XZ). */
export function distToSegment(p: { x: number; z: number }, a: Vector3, b: Vector3): number {
  const abx = b.x - a.x, abz = b.z - a.z;
  const apx = p.x - a.x, apz = p.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / len2));
  const cx = a.x + abx * t - p.x, cz = a.z + abz * t - p.z;
  return Math.hypot(cx, cz);
}

/** How far off the centre line a point is. */
export function distToTrack(p: { x: number; z: number }, course: Course): number {
  // A DERIVED COURSE MEASURES AGAINST ITS LINE. The gates are ~110 m apart, so the polyline through them cuts the
  // inside of every corner — on a derived course that would put the apex of the pier hairpin off the road and hand
  // the player a penalty for taking the racing line.
  const path = course.path;
  if (path && path.length > 1) {
    let best = Infinity;
    const last = course.loop ? path.length : path.length - 1;
    for (let i = 0; i < last; i++) {
      best = Math.min(best, distToSegment(p, path[i], path[(i + 1) % path.length]));
    }
    return Math.min(best, distToSegment(p, course.start.at, path[0]));
  }

  const n = course.gates.length;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const a = course.gates[i].at;
    const b = course.gates[(i + 1) % n].at;
    if (!course.loop && i === n - 1) break;
    best = Math.min(best, distToSegment(p, a, b));
  }
  // the start sits before the first gate, so the run-up counts as road too
  best = Math.min(best, distToSegment(p, course.start.at, course.gates[0].at));
  return best;
}

/** Is the kart on the road? */
export function onTrack(p: { x: number; z: number }, course: Course, halfWidth = TRACK_HALF_WIDTH): boolean {
  return distToTrack(p, course) <= halfWidth;
}
