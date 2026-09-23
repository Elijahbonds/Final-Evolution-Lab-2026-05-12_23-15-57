// THE FIELD — rivals to race against, and the position you are in (2026-09-13).
//
// Owner: "add opponents in those modes you mentioned were missing them." Phase 0 measured both racing modes
// as having none: Velocity Kart and Aero Aces are time trials against a clock, and a clock does not overtake
// you on the last corner. Part 2's Phase 2 asks for the same thing from the other direction — one shared
// race framework both modes consume, with position tracking and AI that "stays competitive without feeling
// scripted".
//
// HOW A RIVAL MOVES, and why it is distance-along-the-line rather than a driving AI. A rival that runs the
// real handling model needs a real driver — pathfinding, throttle control, a recovery behaviour when it
// spins — and every one of those is a place for it to look stupid. A rival that advances along the racing
// line at a believable PACE cannot get stuck on a wall, cannot spin, and cannot drive the wrong way, and
// from a chase camera the two are indistinguishable. The honest name for that is what it is: these are
// pacers, not drivers, and the file says so rather than implying an intelligence that is not there.
//
// WHAT MAKES IT NOT FEEL SCRIPTED, which is the hard part:
//   · every rival has its OWN pace, and the spread is wide enough that finishing order changes run to run
//   · pace varies with the CORNER — a rival slows for a tight one and lets go on a straight, the same
//     trade the player is making, so the field bunches and strings out where a real field would
//   · a slow per-rival wobble, so nobody holds a metronome pace
//   · rubber-banding exists but is BOUNDED and symmetric: it can pull a rival back toward you and push one
//     forward, never past its own pace envelope. A rival that is simply glued to your bumper is the thing
//     players notice and resent, so the band is deliberately weak enough to be beaten by driving well.
//
// Pure maths: no Babylon beyond Vector3, so the field can be tested without a scene.

import { Vector3 } from '@babylonjs/core';
import type { Course } from '../core/RaceCourse';
import { tightestCorner } from '../core/RaceCourse';

/** The racing line as a measured polyline, so a distance can be turned into a place on the track. */
export interface RaceLine {
  /** Points around one lap, starting at the start line. */
  pts: Vector3[];
  /** Cumulative distance to each point. */
  cum: number[];
  /** One lap, metres. */
  lapLength: number;
  /** True when the last point joins back to the first. */
  loop: boolean;
}

export function buildRaceLine(course: Course): RaceLine {
  const pts = [course.start.at.clone(), ...course.gates.map((g) => g.at.clone())];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Vector3.Distance(pts[i - 1], pts[i]));
  const lapLength = cum[cum.length - 1] + (course.loop ? Vector3.Distance(pts[pts.length - 1], pts[0]) : 0);
  return { pts, cum, lapLength, loop: course.loop };
}

/** Where `dist` metres along the line puts you, and which way you are pointing there. */
export function pointAt(line: RaceLine, dist: number): { pos: Vector3; heading: number } {
  const { pts, cum, lapLength, loop } = line;
  let d = loop ? ((dist % lapLength) + lapLength) % lapLength : Math.max(0, Math.min(lapLength, dist));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const segStart = cum[i];
    const segLen = (i + 1 < pts.length ? cum[i + 1] : lapLength) - segStart;
    if (segLen <= 1e-6) continue;
    if (d <= segStart + segLen || i === pts.length - 1) {
      const t = Math.max(0, Math.min(1, (d - segStart) / segLen));
      const pos = a.add(b.subtract(a).scale(t));
      const dir = b.subtract(a);
      return { pos, heading: Math.atan2(dir.x, dir.z) };
    }
  }
  return { pos: pts[0].clone(), heading: course0Heading(line) };
}

function course0Heading(line: RaceLine): number {
  const d = line.pts[1] ? line.pts[1].subtract(line.pts[0]) : new Vector3(0, 0, 1);
  return Math.atan2(d.x, d.z);
}

/** How sharply the line turns `ahead` metres from here, 0 (straight) .. 1 (hairpin). */
export function bendAt(line: RaceLine, dist: number, ahead = 22): number {
  const a = pointAt(line, dist).pos;
  const b = pointAt(line, dist + ahead).pos;
  const c = pointAt(line, dist + ahead * 2).pos;
  const v1 = b.subtract(a); v1.y = 0;
  const v2 = c.subtract(b); v2.y = 0;
  if (v1.lengthSquared() < 1e-6 || v2.lengthSquared() < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, Vector3.Dot(v1.normalize(), v2.normalize())));
  return Math.acos(cos) / Math.PI;
}

export interface Rival {
  name: string;
  tint: string;
  /** Distance travelled along the line, metres. Keeps counting past a lap. */
  dist: number;
  /** Current pace, m/s. */
  speed: number;
  /** Metres left or right of the centre line, so the field is not a conga line. */
  lane: number;
  /**
   * 0..1. Drives the rival's pace envelope. Deliberately spread across the field rather than clustered,
   * because a field where everyone is the same speed has no overtaking in it.
   */
  skill: number;
  /** Per-rival phase for the pace wobble, so nobody is synchronised with anybody. */
  phase: number;
}

export const RIVAL_NAMES = ['VOSS', 'KEELE', 'ARIN', 'MOTA', 'SABRE', 'HOLT', 'JUNO'] as const;   // JUNO: the eighth racer an Aero Aces circuit grids (2026-09-15)
export const RIVAL_TINTS = ['#4cc9f0', '#ffd75e', '#8fe0a0', '#c99bf7', '#ff7b54', '#e0604a', '#7ae582'] as const;

/** Line up a field. Skills are spread, not clustered, and the grid is behind the player. */
export function makeField(count: number, topSpeed: number, difficulty = 0.5): Rival[] {
  const n = Math.max(0, Math.min(RIVAL_NAMES.length, count));
  return Array.from({ length: n }, (_, i) => ({
    name: RIVAL_NAMES[i],
    tint: RIVAL_TINTS[i],
    // start behind the line, staggered, alternating sides — a grid, not a stack
    dist: -6 - i * 5,
    speed: topSpeed * 0.25,
    lane: (i % 2 === 0 ? -1 : 1) * (2.6 + Math.floor(i / 2) * 1.1),
    // THE SPREAD, and difficulty has to move it a long way or the tiers are decoration. The first version
    // ran 0.87..0.94 of the player's top speed at difficulty 0 AND at difficulty 1 — measured, a player
    // lapping at 82% finished last on easy and last on hard, so the setting changed nothing anyone could
    // feel. Now: easy 0.68..0.77, normal 0.79..0.89, hard 0.91..1.00 of top speed.
    skill: clamp01(0.25 + difficulty * 0.55 + (i / Math.max(1, n - 1)) * 0.22 - 0.11),
    phase: (i * 2.399) % (Math.PI * 2),
  }));
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

/** How strongly the field is pulled back toward the player. Small on purpose — see the header. */
export const RUBBER_BAND = 0.12;
/** Nobody may be rubber-banded outside this fraction of their own pace. */
export const BAND_LIMIT = 0.14;

export interface FieldSpec {
  /** The player's vehicle top speed, m/s — the field is paced against it. */
  topSpeed: number;
  /** How much a corner slows a rival, 0..1 of pace at a hairpin. */
  cornerBite?: number;
}

/**
 * Advance one rival.
 *
 * `playerDist` is what the band reads. Pass the player's own distance along the line so the field knows
 * whether it is ahead or behind; the band is symmetric and bounded, so a rival can be caught and can catch.
 */
export function stepRival(r: Rival, line: RaceLine, dt: number, playerDist: number, spec: FieldSpec, t: number): void {
  const bite = spec.cornerBite ?? 0.55;
  // the pace this rival would hold on a straight
  const base = spec.topSpeed * (0.62 + r.skill * 0.42);
  // corners cost, the same trade the player is making
  const bend = bendAt(line, r.dist);
  const cornered = base * (1 - bite * bend);
  // a slow wobble so nobody runs a metronome
  const wobble = 1 + Math.sin(t * 0.6 + r.phase) * 0.045;
  // the band: bounded, symmetric, weak enough to out-drive
  const gap = playerDist - r.dist;
  const band = Math.max(-BAND_LIMIT, Math.min(BAND_LIMIT, (gap / 140) * RUBBER_BAND));
  const target = cornered * wobble * (1 + band);
  // ease toward the target rather than snapping, so a rival looks like it is driving
  r.speed += (target - r.speed) * Math.min(1, 2.2 * dt);
  r.dist += r.speed * dt;
}

/** Where to draw this rival. */
export function rivalPlacement(r: Rival, line: RaceLine): { pos: Vector3; heading: number } {
  const at = pointAt(line, r.dist);
  const side = new Vector3(Math.cos(at.heading), 0, -Math.sin(at.heading));
  return { pos: at.pos.add(side.scale(r.lane)), heading: at.heading };
}

export interface Standing {
  name: string;
  dist: number;
  isPlayer: boolean;
}

/** The order of the field, leader first. */
export function standings(playerDist: number, rivals: readonly Rival[], playerName = 'YOU'): Standing[] {
  const all: Standing[] = [
    { name: playerName, dist: playerDist, isPlayer: true },
    ...rivals.map((r) => ({ name: r.name, dist: r.dist, isPlayer: false })),
  ];
  return all.sort((a, b) => b.dist - a.dist);
}

// THE RACE ENDS FOR EVERYONE (MECHANICS PASS, 2026-09-15). A race only ever ended when the PLAYER crossed the line:
// a player who stalled, got lost or put the pad down sat in a race that could never finish, with the field circling
// forever — the release gauntlet's kart and aero runs hit the cap with no result at all. The arcade rule every kart
// game teaches: when the field's LEADER finishes, the rest get a short, visible clock to the line; when it runs out,
// the race is over and you place where you are. Cause → effect: the banner says who finished and how long you have.
export const FINISH_GRACE_SEC = 15;

/** The first rival to have run every lap, or null. `dist` keeps counting past a lap, so this is a plain distance test. */
export function fieldLeaderDone(rivals: readonly Rival[], line: RaceLine, laps: number): Rival | null {
  const total = line.lapLength * Math.max(1, laps);
  let best: Rival | null = null;
  for (const r of rivals) if (r.dist >= total && (!best || r.dist > best.dist)) best = r;
  return best;
}

/** One frame of the finish clock. `left` null = not running. Returns the new value, whether it just started, and
 *  whether it just ran out. Whole-second ticks are reported so a host can count the last seconds down. */
export function stepFinishGrace(left: number | null, dt: number, leaderDone: boolean, grace = FINISH_GRACE_SEC): { left: number | null; started: boolean; expired: boolean; tick: number | null } {
  if (left === null) return leaderDone ? { left: grace, started: true, expired: false, tick: Math.ceil(grace) } : { left: null, started: false, expired: false, tick: null };
  const next = left - Math.max(0, dt);
  const tick = Math.ceil(next) !== Math.ceil(left) ? Math.max(0, Math.ceil(next)) : null;
  return next <= 0 ? { left: 0, started: false, expired: true, tick: 0 } : { left: next, started: false, expired: false, tick };
}

/** The player's position, 1-based. */
export function playerPosition(playerDist: number, rivals: readonly Rival[]): number {
  return 1 + rivals.reduce((n, r) => n + (r.dist > playerDist ? 1 : 0), 0);
}

/** "3rd" — for the HUD. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * A suggested field size and difficulty for a course.
 *
 * Tighter courses get a smaller field, because eight cars on a circuit whose corners are inside the grip
 * limit is not a race, it is a pile-up the player cannot see past.
 */
export function fieldFor(course: Course, topSpeed: number, grip: number): { count: number; difficulty: number } {
  const holdable = (topSpeed * topSpeed) / Math.max(1, grip);
  const tight = tightestCorner(course) < holdable * 0.7;
  return { count: tight ? 3 : 5, difficulty: 0.5 };
}

/** R3 — WHO IS AROUND YOU (racing pass, 2026-09-23). The nearest rival ahead and behind as seconds at your own speed, in
 *  one line a player reads at a glance: "VOSS 1.4 s AHEAD · KEELE 0.6 s BEHIND", "LEADING · …", "… · NOBODY BEHIND".
 *  `gap` is metres along the course, positive = the rival is ahead. Seconds use at least 10 m/s so a standing start does
 *  not read as a minute. */
export function aroundCall(rivals: readonly { name: string; gap: number }[], speed: number): string {
  const v = Math.max(10, Math.abs(speed));
  const ahead = rivals.filter((r) => r.gap > 0).sort((a, b) => a.gap - b.gap)[0];
  const behind = rivals.filter((r) => r.gap <= 0).sort((a, b) => b.gap - a.gap)[0];
  const s = (m: number) => `${(Math.abs(m) / v).toFixed(1)} s`;
  const front = ahead ? `${ahead.name} ${s(ahead.gap)} AHEAD` : 'LEADING';
  const back = behind ? `${behind.name} ${s(behind.gap)} BEHIND` : 'NOBODY BEHIND';
  return `${front} · ${back}`;
}
