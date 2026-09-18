// RIM PHYSICS — a miss you can read (2026-09-12).
//
// Until now a missed shot never touched the iron. The arc finished and the ball was handed a random
// loose vector: `launchLoose(ball.position, new Vector3((Math.random()-0.5)*3, 2.5, 1.5+Math.random()))`.
// Every miss therefore looked the same and told the shooter nothing. In 2K the rebound IS feedback —
// short is front iron and comes back at you, long is back iron and kicks out, and you learn your
// stroke from where the ball goes.
//
// So the deflection is DERIVED FROM THE MISS, not rolled. A shot short by 20 cm hits the front of
// the ring and returns toward the shooter; the same shot long hits the back and runs away; a lateral
// error glances off that side. Randomness is a garnish (a few cm of scatter), never the author —
// because a rebound that cannot be predicted cannot be contested, and boxing out stops meaning
// anything.

import { Vector3 } from '@babylonjs/core';

/** Regulation-ish: an 18" ring is 0.2286 m radius. The ball is 0.12 m. */
export const RIM_RADIUS = 0.2286;
export const BALL_RADIUS = 0.12;

export type RimHitKind = 'swish' | 'front' | 'back' | 'left' | 'right' | 'in_and_out' | 'backboard';

export interface RimResult {
  kind: RimHitKind;
  /** Where the ball struck, world space. */
  contact: Vector3;
  /** Velocity leaving the iron. Feed this straight to the loose-ball sim. */
  outVel: Vector3;
  /** Made it after all? An in-and-out is a miss; a swish and a soft roll-in are makes. */
  made: boolean;
  /** For the HUD and commentary — the shooter should be told what they did. */
  label: string;
}

export interface MissProfile {
  /** Metres short (negative) or long (positive) of the rim centre. */
  depthError: number;
  /** Metres left (negative) or right (positive), from the shooter's view. */
  lateralError: number;
  /** Downward speed at the rim, m/s. A flat shot punishes harder than a soft one. */
  descentSpeed: number;
}

/** How bouncy the iron is. Real rims are damped — a rim shot should not rocket. */
const RIM_RESTITUTION = 0.45;
/** Inside this, the ball is through without touching anything. */
export const SWISH_WINDOW = RIM_RADIUS - BALL_RADIUS;      // ~0.109 m of pure daylight
/** Beyond this it never reached the ring at all — an airball, not a rim hit. */
export const AIRBALL_DISTANCE = RIM_RADIUS + BALL_RADIUS + 0.35;

/**
 * Resolve a shot at the ring.
 *
 * `toShooter` is the horizontal unit vector from the rim back toward the shooter — the front of the
 * ring is the side facing them, which is what makes "short comes back to you" true from anywhere on
 * the floor rather than only along one axis.
 */
export function resolveRim(rimCentre: Vector3, toShooter: Vector3, miss: MissProfile, jitter = 0): RimResult {
  const radial = Math.hypot(miss.depthError, miss.lateralError);
  const speed = Math.max(1.5, Math.abs(miss.descentSpeed));

  // clean through
  if (radial <= SWISH_WINDOW * 0.55) {
    return { kind: 'swish', contact: rimCentre.clone(), outVel: new Vector3(0, -speed * 0.7, 0), made: true, label: 'SWISH' };
  }

  const back = toShooter.clone(); back.y = 0;
  if (back.lengthSquared() < 1e-6) back.set(0, 0, 1); else back.normalize();
  const side = new Vector3(-back.z, 0, back.x);   // right-hand side of the shot line

  // soft roll-in: touched iron but had the depth — the shooter's reward for a good arc
  if (radial <= SWISH_WINDOW && speed < 6) {
    const contact = rimCentre.add(back.scale(miss.depthError < 0 ? RIM_RADIUS : -RIM_RADIUS));
    return { kind: 'in_and_out', contact, outVel: new Vector3(0, -speed * 0.4, 0), made: true, label: 'IN OFF THE IRON' };
  }

  // which part of the ring did it meet? the dominant error decides, which is what makes it readable
  const lateralDominant = Math.abs(miss.lateralError) > Math.abs(miss.depthError);
  const j = () => (jitter > 0 ? (Math.random() - 0.5) * jitter : 0);

  if (lateralDominant) {
    const dir = miss.lateralError > 0 ? 1 : -1;
    const contact = rimCentre.add(side.scale(dir * RIM_RADIUS));
    // glances off the side and away, keeping a little of the shot's own direction
    const out = side.scale(dir * speed * RIM_RESTITUTION).add(back.scale(speed * 0.25));
    out.y = speed * 0.45;
    return {
      kind: dir > 0 ? 'right' : 'left',
      contact,
      outVel: new Vector3(out.x + j(), out.y, out.z + j()),
      made: false,
      label: dir > 0 ? 'OFF THE RIGHT IRON' : 'OFF THE LEFT IRON',
    };
  }

  if (miss.depthError < 0) {
    // SHORT — front iron, and it comes back toward the shooter. The most useful miss in the game.
    const contact = rimCentre.add(back.scale(RIM_RADIUS));
    const out = back.scale(speed * RIM_RESTITUTION * 1.1);
    out.y = speed * 0.5;
    return { kind: 'front', contact, outVel: new Vector3(out.x + j(), out.y, out.z + j()), made: false, label: 'SHORT — FRONT RIM' };
  }

  // LONG — back iron, and it runs away from the shooter
  const contact = rimCentre.add(back.scale(-RIM_RADIUS));
  const out = back.scale(-speed * RIM_RESTITUTION);
  out.y = speed * 0.6;                                  // the back iron kicks it up more
  return { kind: 'back', contact, outVel: new Vector3(out.x + j(), out.y, out.z + j()), made: false, label: 'LONG — BACK IRON' };
}

/**
 * Turn the shot's own quality into a miss profile.
 *
 * `quality` is the meter result: 1 is perfect, 0 is terrible. `bias` lets a mode push misses short
 * (fatigue, a hand in the face) or long (rushing), so a contested shot misses the way a contested
 * shot actually misses rather than randomly.
 */
export function missProfileFor(quality: number, bias: { short?: number; lateral?: number } = {}, rand = Math.random): MissProfile {
  const q = Math.max(0, Math.min(1, quality));
  const error = (1 - q) * 0.55;                          // up to ~55 cm off at the worst
  const depth = -(bias.short ?? 0) * error + (rand() - 0.5) * error;
  const lateral = (bias.lateral ?? 0) * error + (rand() - 0.5) * error * 0.8;
  return {
    depthError: depth,
    lateralError: lateral,
    descentSpeed: 5 + (1 - q) * 3,
  };
}

/**
 * The same profile, but guaranteed to meet iron.
 *
 * The modes score a shot by percentage BEFORE the ball flies, so by the time the arc resolves the
 * result is already decided. If the derived profile happened to land inside the swish window we would
 * deflect as a make while the scoreboard recorded a miss — the HUD contradicting the score. So when
 * the caller already knows it missed, the error is pushed out to the iron: a true miss every time,
 * still in the direction the shot earned.
 */
export function forcedMissProfile(
  quality: number, bias: { short?: number; lateral?: number } = {}, rand = Math.random,
): MissProfile {
  const p = missProfileFor(quality, bias, rand);
  const radial = Math.hypot(p.depthError, p.lateralError);
  const floor = SWISH_WINDOW + 0.02;            // clear of both the swish and the soft roll-in
  if (radial >= floor) return p;
  // a dead-centre error has no direction to preserve: send it short, the most common real miss
  if (radial < 1e-4) return { ...p, depthError: -floor };
  const k = floor / radial;
  return { ...p, depthError: p.depthError * k, lateralError: p.lateralError * k };
}
