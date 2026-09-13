// LOOSE BALL — it bounces off bodies, and somebody has to actually go and get it (2026-09-12).
//
// A rebound used to be decided the instant the shot missed: boardRace compared two distances, added
// a box-out bonus and a jitter roll, and announced a winner. The ball's real position was read once,
// for that comparison, and the ball itself was never in play. So there was nothing to chase, nothing
// to tip, and no reason for the ball to be anywhere in particular.
//
// Here the ball stays live. It comes off the iron with the deflection RimPhysics gives it, bounces,
// hits bodies, and is secured by whoever gets to it — which is what makes boxing out mean something
// physical rather than being a modifier in a dice roll.
//
// Pure maths, no Babylon nodes beyond Vector3, so the contest rules are testable without a scene.

import { Vector3 } from '@babylonjs/core';

export interface BodyRef {
  id: string;
  /** Feet position. */
  pos: Vector3;
  /** Horizontal radius of the torso. */
  radius: number;
  /** How high this body can reach — a taller player secures a ball others cannot. */
  reachY: number;
  /** Holding the seal. Worth real position on a contest, not a dice modifier. */
  boxingOut?: boolean;
  /** Momentarily unable to secure (stunned, floored, mid-animation). */
  unavailable?: boolean;
}

export interface BodyHit {
  body: BodyRef;
  /** Velocity after the deflection. */
  outVel: Vector3;
  /** Where on the body it struck, world space. */
  contact: Vector3;
}

/** Bodies absorb — a ball off a chest drops, it does not ping away like off a wall. */
const BODY_RESTITUTION = 0.35;

/**
 * Deflect the ball off the first body its travel segment touches this frame.
 *
 * Swept against the segment prev→now rather than the single frame position, for the same reason
 * BallPhysics sweeps its panel test: at rebound speeds a ball crosses a torso inside one frame and
 * a point test misses it entirely.
 */
export function ballVsBodies(
  prev: Vector3, now: Vector3, vel: Vector3, ballRadius: number, bodies: readonly BodyRef[],
): BodyHit | null {
  let best: BodyHit | null = null;
  let bestT = Infinity;

  for (const b of bodies) {
    // vertical band the torso occupies; a ball over the head or under the knees passes
    const lowY = b.pos.y + 0.35, highY = b.pos.y + b.reachY;
    const midY = (prev.y + now.y) / 2;
    if (midY + ballRadius < lowY || midY - ballRadius > highY) continue;

    const rr = b.radius + ballRadius;
    // closest approach of the horizontal segment to the body centre
    const px = prev.x - b.pos.x, pz = prev.z - b.pos.z;
    const dx = now.x - prev.x, dz = now.z - prev.z;
    const segLenSq = dx * dx + dz * dz;
    const t = segLenSq < 1e-9 ? 0 : Math.max(0, Math.min(1, -(px * dx + pz * dz) / segLenSq));
    const cx = px + dx * t, cz = pz + dz * t;
    if (cx * cx + cz * cz > rr * rr) continue;
    if (t >= bestT) continue;

    const n = new Vector3(cx, 0, cz);
    if (n.lengthSquared() < 1e-9) n.set(1, 0, 0); else n.normalize();
    // reflect the horizontal component, damp it, and keep the ball falling
    const vDotN = vel.x * n.x + vel.z * n.z;
    const out = new Vector3(
      (vel.x - 2 * vDotN * n.x) * BODY_RESTITUTION,
      vel.y * 0.6,
      (vel.z - 2 * vDotN * n.z) * BODY_RESTITUTION,
    );
    bestT = t;
    best = { body: b, outVel: out, contact: new Vector3(b.pos.x + n.x * rr, midY, b.pos.z + n.z * rr) };
  }
  return best;
}

export interface PickupOptions {
  /** How far a body can reach horizontally to secure it. */
  reach?: number;
  /** Above this speed the ball is bobbled rather than cleanly secured. */
  cleanSpeed?: number;
  /** Position advantage, in metres, that holding the seal is worth. */
  boxOutEdge?: number;
  rand?: () => number;
}

export interface PickupResult {
  /** Who secured it, or null if nobody is close enough yet. */
  winner: BodyRef | null;
  /** Two or more bodies were in reach — worth a tussle animation and a louder call. */
  contested: boolean;
  /** Secured but not cleanly: the ball squirts loose again with reduced speed. */
  bobbled: boolean;
}

/**
 * Who comes down with it.
 *
 * Distance decides, boxing out is worth real metres, and a ball moving fast can be bobbled — but
 * the outcome is driven by where the bodies actually are, so getting to the right spot is the skill
 * rather than winning a roll after the fact.
 */
export function resolvePickup(
  ballPos: Vector3, ballVel: Vector3, bodies: readonly BodyRef[], opts: PickupOptions = {},
): PickupResult {
  const reach = opts.reach ?? 0.95;
  const cleanSpeed = opts.cleanSpeed ?? 7.5;
  const boxOutEdge = opts.boxOutEdge ?? 0.55;
  const rand = opts.rand ?? Math.random;

  const inReach = bodies
    .filter((b) => !b.unavailable)
    .map((b) => {
      const d = Math.hypot(ballPos.x - b.pos.x, ballPos.z - b.pos.z);
      // the seal is worth position: it reads as being closer than you are
      const effective = d - (b.boxingOut ? boxOutEdge : 0);
      const canReachHeight = ballPos.y <= b.pos.y + b.reachY + 0.15;
      return { b, d, effective, canReachHeight };
    })
    .filter((x) => x.d <= reach && x.canReachHeight)
    .sort((a, b) => a.effective - b.effective);

  if (!inReach.length) return { winner: null, contested: false, bobbled: false };

  const contested = inReach.length > 1 && Math.abs(inReach[0].effective - inReach[1].effective) < 0.3;
  const speed = Math.hypot(ballVel.x, ballVel.y, ballVel.z);
  // a hot ball in traffic is the one that squirts away
  const bobbleChance = Math.max(0, (speed - cleanSpeed) / 10) + (contested ? 0.18 : 0);
  const bobbled = rand() < bobbleChance;

  return { winner: inReach[0].b, contested, bobbled };
}

/** A bobble keeps the ball live, moving away from the traffic that caused it. */
export function bobbleVelocity(ballVel: Vector3, rand: () => number = Math.random): Vector3 {
  const keep = 0.45;
  return new Vector3(
    ballVel.x * keep + (rand() - 0.5) * 1.6,
    Math.max(1.2, Math.abs(ballVel.y) * 0.4),
    ballVel.z * keep + (rand() - 0.5) * 1.6,
  );
}

/** What winning a board means. Whose miss it was is half the answer. */
export type BoardOutcome = 'putback' | 'possession';

/**
 * Securing a rebound off YOUR OWN miss is an offensive rebound: the play continues and you can go
 * straight back up. Securing it off THEIRS is a change of possession.
 *
 * This distinction is the whole value of an offensive rebound, and collapsing it was a real bug: every
 * board reset both bodies to the check, so winning your own miss earned you exactly what losing it
 * would have. Kept as a pure rule so all four combinations are provable without a scene.
 */
export function boardOutcome(winner: string, shooter: string): BoardOutcome {
  return winner === shooter ? 'putback' : 'possession';
}
