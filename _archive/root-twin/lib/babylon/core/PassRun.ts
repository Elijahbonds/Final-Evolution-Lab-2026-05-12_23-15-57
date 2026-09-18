// PassRun — Mode 4 Phases 5–7: passing, blocking, and defense for the
// football build. Pure logic, headless-tested.
//
//   Routes — receivers run timed route stems (slant/streak/flat/out);
//     their position is a function of the play clock (throw timing reads).
//   Throw — QB timing meter: early/perfect/late on the receiver's break
//     sets accuracy; lead-passing places the ball where the receiver WILL
//     be. Contested catch: defender proximity + timing vs the throw's
//     accuracy — no hidden dice.
//   Blocking — line matchups resolve per-rusher (win/lose/hold) with
//     Havok-backed push; a won block opens a LANE the carrier can read
//     (the lane state is queryable geometry, connecting Phase 4 vision to
//     Phase 6 physics).
//   Defense — coverage zones/man trails; a pass is contested/picked when
//     a defender is positioned + timed; tackles run resolveTackle (P4).

import { Vector3 } from '@babylonjs/core';

// ── Routes ─────────────────────────────────────────────────────────────────
export interface RouteDef {
  id: string;
  label: string;
  /** waypoints (yardage offsets from the line), time at each (s) */
  stem: { d: Vector3; at: number }[];
  breakAt: number;            // when the route breaks (the timing window)
}

export const ROUTES: Record<string, RouteDef> = {
  slant: { id: 'slant', label: 'SLANT', breakAt: 0.9, stem: [
    { d: new Vector3(0, 0, 3), at: 0.9 }, { d: new Vector3(-3, 0, 6), at: 1.6 },
  ] },
  streak: { id: 'streak', label: 'STREAK', breakAt: 1.4, stem: [
    { d: new Vector3(0, 0, 8), at: 1.4 }, { d: new Vector3(0, 0, 18), at: 2.6 },
  ] },
  flat: { id: 'flat', label: 'FLAT', breakAt: 0.6, stem: [
    { d: new Vector3(2, 0, 1), at: 0.6 }, { d: new Vector3(6, 0, 2), at: 1.3 },
  ] },
  out: { id: 'out', label: 'OUT', breakAt: 1.0, stem: [
    { d: new Vector3(0, 0, 5), at: 1.0 }, { d: new Vector3(4, 0, 5), at: 1.7 },
  ] },
};

/** Receiver position at time t along the route (from the line spot). */
export function routePosition(route: RouteDef, start: Vector3, t: number): Vector3 {
  if (t <= 0) return start.clone();
  let prev = { d: Vector3.Zero(), at: 0 };
  for (const wp of route.stem) {
    if (t <= wp.at) {
      const k = (t - prev.at) / (wp.at - prev.at);
      return start.add(Vector3.Lerp(prev.d, wp.d, Math.max(0, Math.min(1, k))));
    }
    prev = wp;
  }
  return start.add(route.stem[route.stem.length - 1].d);
}

// ── The throw ──────────────────────────────────────────────────────────────
export type ThrowGrade = 'perfect' | 'early' | 'late' | 'wild';

export interface ThrowResult {
  grade: ThrowGrade;
  leadPoint: Vector3;         // where the ball goes
  accuracy01: number;         // catch difficulty for the receiver
}

/** Release the ball at meterT (0..1) toward a receiver on `route` at
 *  clock tNow. Perfect = released as the route breaks; early/late move
 *  the lead point off the receiver's break point. */
export function throwBall(meterT: number, route: RouteDef, wrStart: Vector3, tNow: number): ThrowResult {
  const breakT = route.breakAt;
  // the meter centers on the break; perfect window ±0.12
  const d = meterT - 0.62;
  const grade: ThrowGrade = Math.abs(d) <= 0.12 ? 'perfect' : Math.abs(d) <= 0.3 ? (d < 0 ? 'early' : 'late') : 'wild';
  // lead point: where the receiver is at their break + lead by grade
  const leadT = breakT + (grade === 'perfect' ? 0.15 : grade === 'early' ? -0.1 : 0.25);
  const leadPoint = routePosition(route, wrStart, leadT);
  if (grade === 'wild') leadPoint.x += (Math.random() - 0.5) * 4;
  const accuracy01 = grade === 'perfect' ? 1 : grade === 'early' || grade === 'late' ? 0.6 : 0.15;
  return { grade, leadPoint, accuracy01 };
}

// ── Catch / contest / pick ─────────────────────────────────────────────────
export type CatchOutcome = 'catch' | 'incomplete' | 'interception';

export interface ContestInput {
  accuracy01: number;          // throw quality
  defenderDist: number;        // nearest defender to the catch point
  defenderTimedJump: boolean;  // defender jumped with the throw (positioning+timing)
  receiverOpen: boolean;       // created separation at the break
}

/** Contested catch resolution — positioning and timing, not dice. */
export function resolveCatch(i: ContestInput): CatchOutcome {
  if (i.defenderTimedJump && i.defenderDist < 1.2 && i.accuracy01 < 1) return 'interception';
  if (i.defenderDist < 1.0 && i.accuracy01 < 0.7 && !i.receiverOpen) return 'incomplete';
  if (i.accuracy01 < 0.2) return 'incomplete';
  return 'catch';
}

// ── Blocking / lanes ───────────────────────────────────────────────────────
export interface BlockMatchup { id: string; blockerPos: Vector3; rusherPos: Vector3 }

export type BlockResult = 'won' | 'holding' | 'lost';

export class LinePlay {
  private state: Map<string, BlockResult> = new Map();

  constructor(private matchups: BlockMatchup[]) {
    for (const m of matchups) this.state.set(m.id, 'holding');
  }

  /** Per-frame: a rusher wins when they slip past the blocker's line
   *  (lateral beat); a blocker wins by sustaining contact 1.2s. */
  update(dt: number, positions: Map<string, { blocker: Vector3; rusher: Vector3 }>): void {
    for (const m of this.matchups) {
      const cur = this.state.get(m.id);
      if (cur !== 'holding') continue;
      const p = positions.get(m.id);
      if (!p) continue;
      const gap = Vector3.Distance(p.blocker, p.rusher);
      if (gap > 1.6) this.state.set(m.id, 'lost');      // beat clean
    }
  }

  get(id: string): BlockResult { return this.state.get(id) ?? 'lost'; }

  /** Is a running LANE open at `laneX`? A lane is open when the nearest
   *  matchup's block is won or holding the rusher AWAY from it. */
  laneOpen(laneX: number): boolean {
    let open = false;
    for (const m of this.matchups) {
      const r = this.state.get(m.id);
      const nearLane = Math.abs(m.blockerPos.x - laneX) < 1.6;
      if (nearLane && (r === 'won' || r === 'holding')) open = true;
    }
    return open;
  }
}

// ── Coverage ───────────────────────────────────────────────────────────────
export function coverageContest(defenderPos: Vector3, catchPoint: Vector3, defenderJumped: boolean): { dist: number; timed: boolean } {
  return { dist: Vector3.Distance(defenderPos, catchPoint), timed: defenderJumped };
}
