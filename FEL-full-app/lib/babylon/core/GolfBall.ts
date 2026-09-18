// GolfBall + Terrain — Golf Phase 2: physics-based ball flight and course
// interaction. The ball rides SoccerBall's proven Magnus/drag/bounce core
// with a golf tune (smaller, dimpled aerodynamics, livelier bounce); what
// golf adds is TERRAIN: the surface under the ball changes the roll and
// the next shot's lie, and water/OB are penalty triggers — not scripted
// outcomes.
//
// Wind: the flight model accepts a wind vector; v1 ships with wind OFF by
// default (zeroed) — flagged per the build prompt. Enabling is one config.

import { Vector3 } from '@babylonjs/core';
import { SoccerBall, type BallTuning } from './SoccerBall';

export const GOLF_BALL: BallTuning = {
  radius: 0.043, mass: 0.046, dragK: 0.006, magnusK: 0.006,
  grassFriction: 1.8, restitution: 0.6, skidFactor: 0.8,
};

export type Surface = 'fairway' | 'rough' | 'sand' | 'green' | 'water' | 'ob';

/** Roll friction per surface — rough grabs, sand stops, greens roll true. */
export const SURFACE_FRICTION: Record<Surface, number> = {
  fairway: 1.8, rough: 4.4, sand: 9.5, green: 1.1, water: 0, ob: 1.8,   // [TUNE]
};

export class GolfBallSim {
  readonly ball: SoccerBall;
  surface: Surface = 'fairway';
  /** wind: m/s vector; ZERO by default in v1 (feature-flagged off). */
  wind = Vector3.Zero();

  constructor(mesh: { position: Vector3 }) {
    this.ball = new SoccerBall(mesh, GOLF_BALL);
  }

  /** Launch from a resolved swing (GolfCore.resolveShot output). */
  launchFromShot(from: Vector3, dirYaw: number, shot: { carryM: number; launchDeg: number; offlineRad: number }): void {
    const yaw = dirYaw + shot.offlineRad;
    // carry from vacuum range + a drag-aware bump (the sim's drag steals some)
    const speed = Math.sqrt(shot.carryM * 9.81 / Math.sin(2 * shot.launchDeg * Math.PI / 180)) * 1.35;
    const dir = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const v = dir.scale(speed * Math.cos(shot.launchDeg * Math.PI / 180));
    v.y = speed * Math.sin(shot.launchDeg * Math.PI / 180);
    // golf backspin keeps approach shots up — but MODERATELY: lift must be
    // a fraction of gravity or the ball balloons (spin ~ -0.25×loft gives
    // ~10-20% g of lift at driver speeds)
    this.ball.launch(from, v, new Vector3(-shot.launchDeg * 0.28, shot.offlineRad * 220, 0));
  }

  /** Frame step on a surface map. Returns 'water' | 'ob' | 'ok'. */
  step(dt: number, surfaceAt: (p: Vector3) => Surface): 'water' | 'ob' | 'ok' {
    this.surface = surfaceAt(this.ball.pos);
    if (this.surface === 'water' || this.surface === 'ob') {
      this.ball.stop();
      return this.surface;
    }
    // surface friction drives the roll
    this.ball['tune'] = { ...GOLF_BALL, grassFriction: SURFACE_FRICTION[this.surface] };
    // wind (v1: off)
    if (this.wind.lengthSquared() > 0 && !this.ball.rolling) {
      this.ball.vel.addInPlace(this.wind.scale(dt * 0.35));
    }
    this.ball.step(dt);
    return 'ok';
  }
}

/** Putting: the same three-click meter with tighter tolerances and a pure
 *  roll read — a putt is a ground ball with pace. */
export function resolvePutt(r: { power01: number; face01: number }, distM: number, breakSlope: number): {
  paceM: number; offlineRad: number; lips: boolean;
} {
  const paceM = distM * (0.75 + r.power01 * 0.6);   // [TUNE]
  const offlineRad = (1 - r.face01) * 0.05 + breakSlope * 0.02;
  return { paceM, offlineRad, lips: Math.abs(offlineRad) > 0.03 && paceM > distM * 1.1 };
}
