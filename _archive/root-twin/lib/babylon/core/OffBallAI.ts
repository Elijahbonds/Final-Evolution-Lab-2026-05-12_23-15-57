// OffBallAI — Mode 5 Phase 6 (the beat-EA-FC mechanic): off-ball movement
// with real decision logic, not formation waypoints.
//
//   Supporting runs — each off-ball attacker evaluates SPACE (distance
//     from defenders + ahead of the ball) and TIMING (stay onside, arrive
//     as the lane opens). Runs: into space ahead, overlap (wide run past
//     the carrier), near/far-post on a cross, hold/show for the short pass.
//   Shape — a width/spacing discipline term keeps players from clumping:
//     each attacker has a lateral "lane" home and only leaves it for a
//     genuinely better scoring chance.
//   Lane awareness — runs target open passing lanes (no defender between
//     ball and destination corridor).
//
// Everything is pure logic over positions; the mode renders and moves.

import { Vector3 } from '@babylonjs/core';

export type RunKind = 'hold' | 'intoSpace' | 'overlap' | 'nearPost' | 'farPost' | 'show';

export interface PlayerPos { id: string; pos: Vector3; role: 'att' | 'mid' | 'def' }

export interface RunDecision {
  target: Vector3;
  kind: RunKind;
  urgency: number;            // 0..1 — how hard to sprint
}

const PITCH = { halfW: 30, goalZ: 45 };

/** Space score: distance from nearest defender + how far ahead of the ball. */
function spaceScore(p: Vector3, defenders: Vector3[], ball: Vector3): number {
  const dMin = defenders.length ? Math.min(...defenders.map((d) => Vector3.Distance(d, p))) : 20;
  const ahead = Math.max(0, (p.z - ball.z) * 0.06);
  return dMin * 0.5 + ahead;
}

/** Is the corridor ball→target clear of defenders? */
function laneOpen(ball: Vector3, target: Vector3, defenders: Vector3[]): boolean {
  const dir = target.subtract(ball); dir.y = 0;
  const len = dir.length();
  if (len < 0.5) return true;
  const d = dir.normalize();
  return !defenders.some((f) => {
    const rel = f.subtract(ball); rel.y = 0;
    const along = Vector3.Dot(rel, d);
    if (along < 0.5 || along > len) return false;
    return rel.subtract(d.scale(along)).length() < 1.6;
  });
}

/** Decide an off-ball attacker's run. */
export function decideRun(
  self: PlayerPos, ball: Vector3, carrierPos: Vector3,
  defenders: Vector3[], crossing: boolean,
): RunDecision {
  const goalDir = new Vector3(0, 0, 1);

  // CROSSING: attack the posts
  if (crossing && self.role === 'att') {
    const nearZ = PITCH.goalZ - 3;
    const far = self.pos.x > 0;
    const post = new Vector3(far ? 2.5 : -2.5, 0, nearZ);
    return { target: post, kind: far ? 'farPost' : 'nearPost', urgency: 1 };
  }

  // INTO SPACE: the best forward pocket with an open lane. A player BEHIND
  // the ball with grass ahead should almost always make the run — the
  // ahead-bonus makes forward motion the default attacking instinct.
  let best: Vector3 | null = null;
  let bestScore = -1;
  const behindBall = self.pos.z < ball.z - 3;
  for (const dz of [4, 8, 12]) {
    for (const dx of [-6, 0, 6]) {
      const p = self.pos.add(new Vector3(dx * 0.4, 0, dz));
      p.x = Math.max(-PITCH.halfW + 2, Math.min(PITCH.halfW - 2, p.x));
      p.z = Math.min(PITCH.goalZ - 1, p.z);
      let s = spaceScore(p, defenders, ball);
      if (behindBall && p.z > self.pos.z) s += 2.5;   // forward runs from deep
      if (s > bestScore && laneOpen(ball, p, defenders)) { bestScore = s; best = p; }
    }
  }

  // OVERLAP: carrier wide and slow = run the outside lane past them
  const carrierWide = Math.abs(carrierPos.x) > PITCH.halfW * 0.55;
  if (carrierWide && self.pos.z < carrierPos.z + 2 && self.role !== 'def') {
    const outside = new Vector3(Math.sign(carrierPos.x) * (Math.abs(carrierPos.x) - 4), 0, carrierPos.z + 8);
    if (laneOpen(ball, outside, defenders)) {
      return { target: outside, kind: 'overlap', urgency: 0.9 };
    }
  }

  if (best && bestScore > spaceScore(self.pos, defenders, ball) + 0.4) {
    return { target: best, kind: 'intoSpace', urgency: Math.min(1, bestScore / 8) };
  }

  // SHOW: come short ONLY when genuinely isolated far from the ball with
  // nothing ahead — not just for being deep
  if (Vector3.Distance(self.pos, ball) > 16 && self.pos.z > ball.z - 4) {
    const short = ball.add(goalDir.scale(-4)).add(new Vector3(Math.sign(self.pos.x - ball.x) * 2, 0, 0));
    return { target: short, kind: 'show', urgency: 0.5 };
  }

  return { target: self.pos.clone(), kind: 'hold', urgency: 0.2 };
}

/** Width discipline: nudge a pack of attackers back to spread lanes.
 *  Returns per-player lateral corrections (never bunch on the ball). */
export function widthCorrections(attackers: PlayerPos[]): Map<string, number> {
  const out = new Map<string, number>();
  const sorted = [...attackers].sort((a, b) => a.pos.x - b.pos.x);
  const lanes = [-18, -9, 0, 9, 18];
  sorted.forEach((p, i) => {
    const home = lanes[Math.min(lanes.length - 1, i)];
    const err = home - p.pos.x;
    if (Math.abs(err) > 4) out.set(p.id, Math.sign(err) * Math.min(1, Math.abs(err) / 8));
  });
  return out;
}
