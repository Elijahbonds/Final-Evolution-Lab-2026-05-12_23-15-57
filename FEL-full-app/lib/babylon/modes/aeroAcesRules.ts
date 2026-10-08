// AERO ACES RULES — the pure pieces of the owner-picked improvements (IMPROVE 2026-10-06, docs/IMPROVEMENTS-2026-10-05.md
// § aeroaces). Everything here is arithmetic on numbers and Vector3, so each rule is pinned by aeroAcesRules.test.ts
// without a scene; AeroAcesMode wires them in.
//
//   #2  racerPlace           a rival's own place, so its balloon item is weighted the way the player's is
//   #3  incomingThreat       the nearest missile coming for the player: time to impact, side, and when to roll
//   #4  BannerSlot           one banner, ranked: a warning is not overwritten by "BUMPED"
//   #6  mapFrame / mapPath   the course strip the host draws
//   #8  aeroScore            what a race is worth: place, bananas, stunts, the best chain, the medal
//   #9  neutralRoll          the B roll with the stick centred: away from the threat, else a fixed side
//   #10 stepRecover          wrong way or no progress for a few seconds → back on the line
//   #11 flyoverPose          the countdown's camera sweep round the circuit
//   #14 hudDue               discrete change at once, the rest at AERO_HUD_HZ

import { Vector3 } from '@babylonjs/core';
import { pointAlong, type CircuitLine } from '../racing/aeroCircuits';
import { MISSILE_SPEED, type Missile } from '../racing/AeroItems';
import { ROLL_SEC, type Stunt } from '../racing/ArcadeFlight';
import type { Medal } from '../core/RaceCourse';

// ── #4 THE BANNER, RANKED ───────────────────────────────────────────────────────────────────────────────────

/** Higher shows over lower. A message of equal or higher rank replaces the one on screen; a lower one waits its turn
 *  (it is dropped: a banner is news, and stale news is worse than none). */
export const BANNER_PRIO = { info: 0, event: 1, threat: 2, final: 3 } as const;
export type BannerPrio = (typeof BANNER_PRIO)[keyof typeof BANNER_PRIO];

export class BannerSlot {
  text = '';
  t = 0;
  prio: BannerPrio = 0;
  /** Offer a message. Returns whether it is now on screen. */
  say(text: string, sec: number, prio: BannerPrio = BANNER_PRIO.info): boolean {
    if (this.t > 0 && prio < this.prio) return false;
    this.text = text; this.t = sec; this.prio = prio;
    return true;
  }
  tick(dt: number): void {
    if (this.t <= 0) return;
    this.t -= dt;
    if (this.t <= 0) this.clear();
  }
  /** Nothing on screen (the "only if quiet" callers ask this). */
  get idle(): boolean { return this.t <= 0; }
  clear(): void { this.text = ''; this.t = 0; this.prio = BANNER_PRIO.info; }
}

// ── #2 A RIVAL'S PLACE ──────────────────────────────────────────────────────────────────────────────────────

/** 1-based place of the racer at `dist` among the player (`playerDist`) and the field, not counting `self`. */
export function racerPlace(dist: number, playerDist: number, field: readonly { dist: number }[], self: number): number {
  let ahead = playerDist > dist ? 1 : 0;
  for (let j = 0; j < field.length; j++) if (j !== self && field[j].dist > dist) ahead++;
  return 1 + ahead;
}

// ── #3 THE MISSILE WARNING ─────────────────────────────────────────────────────────────────────────────────

/** A missile further out than this many seconds is not a warning yet. */
export const THREAT_WARN_SEC = 3;
/** A straight missile is only a threat if its closest approach passes within this of the plane. */
export const THREAT_MISS_M = 9;
/** The roll protects from 10 % to 90 % of ROLL_SEC after the press (ArcadeFlight.dodging). A press that lands while the
 *  missile is under ~0.5 s out is inside the window; the cue lights a little earlier for the thumb's reaction. */
export const ROLL_CUE_SEC = 0.6;

export type ThreatSide = 'BEHIND' | 'LEFT' | 'RIGHT' | 'AHEAD';
export interface Threat {
  /** Seconds to impact at the current closing speed. */
  tti: number;
  side: ThreatSide;
  /** Sideways offset of the missile in the plane's frame, + = right. */
  lateral: number;
  /** Inside the roll's window: press B now. */
  rollNow: boolean;
}

/**
 * The nearest missile coming for the player. A homing missile locked on the player is always a threat; a straight one
 * only when it is closing and its line passes within THREAT_MISS_M. Allocation-free: it reads the missiles' vectors
 * and returns one small object (or null, the common case).
 */
export function incomingThreat(
  missiles: readonly Missile[], playerId: number, pos: Vector3, heading: number, speed: number, warnSec = THREAT_WARN_SEC,
): Threat | null {
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const vx = fx * speed, vz = fz * speed;
  let best: Threat | null = null;
  for (const m of missiles) {
    if (m.owner === playerId) continue;
    const homing = m.homing && m.target === playerId;
    if (m.homing && !homing) continue;   // locked on someone else
    // relative position (missile → plane) and relative velocity (missile − plane), flat plus height
    const rx = pos.x - m.pos.x, ry = pos.y - m.pos.y, rz = pos.z - m.pos.z;
    const dist = Math.hypot(rx, ry, rz);
    if (dist < 1e-3) continue;
    const ux = m.dir.x * MISSILE_SPEED - vx, uy = m.dir.y * MISSILE_SPEED, uz = m.dir.z * MISSILE_SPEED - vz;
    const closing = (ux * rx + uy * ry + uz * rz) / dist;
    if (closing <= 0.5) continue;
    if (!homing) {
      // closest approach of a straight missile against the plane's own straight line
      const u2 = ux * ux + uy * uy + uz * uz;
      const t = u2 > 1e-6 ? (ux * rx + uy * ry + uz * rz) / u2 : 0;
      const cx = rx - ux * t, cy = ry - uy * t, cz = rz - uz * t;
      if (Math.hypot(cx, cy, cz) > THREAT_MISS_M) continue;
    }
    const tti = dist / closing;
    if (tti > warnSec || (best && tti >= best.tti)) continue;
    // where it is in the plane's frame: along = forward, lateral = right
    const ox = m.pos.x - pos.x, oz = m.pos.z - pos.z;
    const along = ox * fx + oz * fz;
    const lateral = ox * fz - oz * fx;
    const side: ThreatSide = along < -Math.abs(lateral) ? 'BEHIND' : along > Math.abs(lateral) ? 'AHEAD' : lateral > 0 ? 'RIGHT' : 'LEFT';
    best = { tti, side, lateral, rollNow: tti <= ROLL_CUE_SEC };
  }
  return best;
}

/** The HUD words for a threat: "MISSILE 1.4s" until the window, then "ROLL NOW". */
export function threatWords(t: Threat | null): string {
  if (!t) return '';
  return t.rollNow ? 'ROLL NOW' : `MISSILE ${t.tti.toFixed(1)}s`;
}

// ── #9 THE NEUTRAL-STICK ROLL ───────────────────────────────────────────────────────────────────────────────

/** B with the stick centred: roll AWAY from the threat's side (+ lateral = right of the plane). With no threat, always
 *  the same way, so the press is a habit and not a coin toss (it used to alternate on the stunt count). */
export const NEUTRAL_ROLL: Stunt = 'roll_right';
export function neutralRoll(threatLateral: number | null): Stunt {
  if (threatLateral === null || Math.abs(threatLateral) < 0.5) return NEUTRAL_ROLL;
  return threatLateral > 0 ? 'roll_left' : 'roll_right';
}

// ── #10 WRONG WAY AND STUCK ─────────────────────────────────────────────────────────────────────────────────

/** Pointed back down the line this long (the banner shows from 1.4 s) puts the plane back on the line. */
export const WRONG_WAY_RESPAWN_SEC = 3;
/** No new ground gained this long (circling, pinned on the course edge) does the same. Longer than any stunt or spin. */
export const NO_PROGRESS_RESPAWN_SEC = 4.5;
/** Ground counts as gained past this many metres beyond the best. */
export const PROGRESS_STEP_M = 2;

export interface RecoverState { wrongT: number; stallT: number; bestDist: number }
export function newRecover(dist = 0): RecoverState { return { wrongT: 0, stallT: 0, bestDist: dist }; }

/**
 * One frame of the recovery net. `exempt` (a stunt, a spin-out, the grid) holds both clocks where they are: a loop
 * faces back for its own length and a spin flies nowhere, and neither is lost. On `respawn` the caller puts the plane
 * on the line at `state.bestDist` — the distance already earned, never more — and the clocks start again.
 */
export function stepRecover(s: RecoverState, dt: number, live: { wrongWay: boolean; dist: number; exempt: boolean }): { state: RecoverState; respawn: boolean } {
  let { wrongT, stallT, bestDist } = s;
  if (live.dist > bestDist + PROGRESS_STEP_M) { bestDist = live.dist; stallT = 0; }
  if (!live.exempt) {
    wrongT = live.wrongWay ? wrongT + dt : 0;
    stallT += dt;
  } else if (!live.wrongWay) wrongT = 0;
  const respawn = wrongT > WRONG_WAY_RESPAWN_SEC || stallT > NO_PROGRESS_RESPAWN_SEC;
  return { state: respawn ? { wrongT: 0, stallT: 0, bestDist } : { wrongT, stallT, bestDist }, respawn };
}

// ── #8 THE SCORE ────────────────────────────────────────────────────────────────────────────────────────────

/** The place table the mode always paid (1st … 8th). */
export const AERO_PLACE_PTS: readonly number[] = [0, 1000, 750, 550, 400, 280, 180, 100, 50];
export const AERO_SCORE = {
  banana: 10,
  /** Each stunt landed, up to stuntCap of them. */
  stunt: 5, stuntCap: 30,
  /** The best chain's points ÷ chainDiv, capped. */
  chainDiv: 10, chainCap: 150,
  /** A finished race's medal against the course's gold time (RaceCourse.medalFor). */
  medal: { gold: 200, silver: 120, bronze: 60, none: 0 } as Record<Medal, number>,
} as const;
/** The most one race can pay: the measured row in lib/sessions/modeScoreRules.ts (aeroAces 1100 × 4) sits above it. */
export const AERO_SCORE_MAX = AERO_PLACE_PTS[1] + 10 * AERO_SCORE.banana + AERO_SCORE.stunt * AERO_SCORE.stuntCap
  + AERO_SCORE.chainCap + AERO_SCORE.medal.gold;

export interface AeroScoreIn { place: number; finished: boolean; bananas: number; stunts: number; bestChain: number; medal: Medal }
export interface AeroScoreOut { total: number; placePts: number; bananaPts: number; stuntPts: number; chainPts: number; medalPts: number }

/** What a race is worth. An unfinished race keeps its place, bananas and style, never a medal. */
export function aeroScore(r: AeroScoreIn): AeroScoreOut {
  const n = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const placePts = AERO_PLACE_PTS[n(r.place)] ?? 0;
  const bananaPts = Math.min(10, n(r.bananas)) * AERO_SCORE.banana;
  const stuntPts = Math.min(AERO_SCORE.stuntCap, n(r.stunts)) * AERO_SCORE.stunt;
  const chainPts = Math.min(AERO_SCORE.chainCap, Math.round(n(r.bestChain) / AERO_SCORE.chainDiv));
  const medalPts = r.finished ? AERO_SCORE.medal[r.medal] ?? 0 : 0;
  return { total: placePts + bananaPts + stuntPts + chainPts + medalPts, placePts, bananaPts, stuntPts, chainPts, medalPts };
}

// ── #6 THE COURSE STRIP ─────────────────────────────────────────────────────────────────────────────────────

/** The map's box (SVG units). The host draws it in a viewBox of this size. */
export const MAP_BOX = 100;
export interface MapFrame { minX: number; minZ: number; scale: number; offX: number; offY: number }

/** Fit a set of points into MAP_BOX with a margin, aspect kept. North (+z) is up the map. */
export function mapFrame(pts: readonly { x: number; z: number }[], margin = 6): MapFrame {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  if (!Number.isFinite(minX)) return { minX: 0, minZ: 0, scale: 1, offX: MAP_BOX / 2, offY: MAP_BOX / 2 };
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxZ - minZ);
  const scale = (MAP_BOX - 2 * margin) / Math.max(w, h);
  return { minX, minZ, scale, offX: (MAP_BOX - w * scale) / 2, offY: (MAP_BOX - h * scale) / 2 };
}

/** A world point on the map: [x, y] in MAP_BOX units, y down (so +z is up). Rounded to 0.1. */
export function toMap(f: MapFrame, x: number, z: number): [number, number] {
  const mx = f.offX + (x - f.minX) * f.scale;
  const my = MAP_BOX - (f.offY + (z - f.minZ) * f.scale);
  return [Math.round(mx * 10) / 10, Math.round(my * 10) / 10];
}

/** The closed course outline as an SVG path, about `samples` points round the lap. */
export function mapPath(line: CircuitLine, f: MapFrame, samples = 96): string {
  const step = Math.max(1, Math.floor(line.pts.length / samples));
  const parts: string[] = [];
  for (let i = 0; i < line.pts.length; i += step) {
    const [x, y] = toMap(f, line.pts[i].x, line.pts[i].z);
    parts.push(`${parts.length ? 'L' : 'M'}${x} ${y}`);
  }
  return `${parts.join(' ')} Z`;
}

/** Racers on the map as one string the host splits: "x,y;x,y;…". */
export function mapDots(f: MapFrame, pts: readonly { x: number; z: number }[]): string {
  let s = '';
  for (let i = 0; i < pts.length; i++) { const [x, y] = toMap(f, pts[i].x, pts[i].z); s += `${i ? ';' : ''}${x},${y}`; }
  return s;
}

// ── #11 THE FLYOVER ─────────────────────────────────────────────────────────────────────────────────────────

/** How long the countdown's sweep round the circuit lasts. A–X skips it. */
export const FLYOVER_SEC = 5;
/** How high above the line, and how far ahead it looks. */
export const FLYOVER = { height: 48, back: 30, look: 90 } as const;

/** Where the flyover camera is `t` seconds in: eased round one lap, high and behind the line, looking down it. */
export function flyoverPose(line: CircuitLine, t: number, sec = FLYOVER_SEC): { pos: Vector3; target: Vector3; done: boolean } {
  const u = Math.max(0, Math.min(1, t / Math.max(0.01, sec)));
  const e = u * u * (3 - 2 * u);                       // smoothstep: a sweep, not a pan at constant rate
  const d = e * line.length;
  const at = pointAlong(line, d);
  const ahead = pointAlong(line, d + FLYOVER.look);
  const pos = at.pos.subtract(at.tangent.scale(FLYOVER.back)).addInPlaceFromFloats(0, FLYOVER.height, 0);
  return { pos, target: ahead.pos, done: u >= 1 };
}

// ── #1 THE GHOST'S AXIS ─────────────────────────────────────────────────────────────────────────────────────

/** A circuit's ghost lives under its own key (ghost.ts keeps one per key), apart from any kart course. */
export const aeroGhostKey = (courseId: string): string => `aero:${courseId}`;
/** Progress through the whole race, 0..1 — the axis every PB comparison is made on. */
export function raceProgress(dist: number, lapLength: number, laps: number): number {
  const total = lapLength * Math.max(1, laps);
  return total > 0 ? Math.max(0, Math.min(1, dist / total)) : 0;
}

// ── #14 THE HUD GATE ────────────────────────────────────────────────────────────────────────────────────────

/** Continuous read-outs (clock, speed, gaps, the map) go this often; a discrete change goes at once. */
export const AERO_HUD_HZ = 10;
export function hudDue(prevKey: string | null, key: string, sinceS: number): boolean {
  return prevKey !== key || sinceS >= 1 / AERO_HUD_HZ;
}

/** For the roll window's own pin: the roll protects for this long after the press starts. */
export const ROLL_PROTECT_SEC = ROLL_SEC * 0.9;
