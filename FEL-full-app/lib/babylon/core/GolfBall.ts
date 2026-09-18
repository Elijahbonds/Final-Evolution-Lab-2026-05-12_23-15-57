// GolfBall + Terrain — Golf Phase 2: physics-based ball flight and course
// interaction. The ball rides SoccerBall's proven Magnus/drag/bounce core
// with a golf tune (smaller, dimpled aerodynamics, livelier bounce); what
// golf adds is TERRAIN: the surface under the ball changes the roll and
// the next shot's lie, and water/OB are penalty triggers — not scripted
// outcomes.
//
// GOLF UPGRADE (owner, 2026-09-17: "upgrade physics, weather"). This sim was built and proven headless but the live
// mode still flew a bare parabola (aimSwingCore.Flight: gravity, no drag, no bounce, no roll, wind as a raw push).
// The mode rides THIS now, and the sim learned three things the weather pass needs:
//   · WIND through the air the ball flies in — a relative-air drag term, so a headwind slows and a tailwind carries,
//     instead of the old fixed push that moved a resting ball as much as a flying one;
//   · WETNESS — a bounce on soaked turf keeps less and the roll dies sooner (WeatherKit.wet01);
//   · AIR DENSITY — rain is heavier air, a touch less carry (WeatherKit.airDensityMult).
// And it SUBSTEPS: a 30 fps frame integrated in one go made the driver's bounce depend on the frame rate.

import { Vector3 } from '@babylonjs/core';
import { SoccerBall, type BallTuning } from './SoccerBall';

export const GOLF_BALL: BallTuning = {
  radius: 0.043, mass: 0.046, dragK: 0.006, magnusK: 0.006,
  grassFriction: 2.6, restitution: 0.6, skidFactor: 0.55,   // GOLF UPGRADE: turf takes a pitch mark — a drive keeps ~half its run on the first bounce, not 80 %
};

export type Surface = 'fairway' | 'rough' | 'sand' | 'green' | 'water' | 'ob';

/** Roll friction per surface — rough grabs, sand stops, greens roll true. */
export const SURFACE_FRICTION: Record<Surface, number> = {
  fairway: 2.6, rough: 5.0, sand: 9.5, green: 1.3, water: 0, ob: 2.6,   // GOLF UPGRADE: a course-scale roll-out (a full drive runs ~12 m, not 40)
};

/** The wind's share of the relative-air drag, over the physical value: a 4 m/s breeze moves a 50 m shot ~6 m, which is
 *  the Wii read (the physical 2 m is invisible at this scale). Still capped by WeatherKit.flightWind. */
export const WIND_GAIN = 2.5;
/** The longest single integration step (s): a 30 fps frame is cut into eight. */
const MAX_STEP = 1 / 240;
/** The cup: a ball this close, this slow, drops. (The mode keeps its own generous gimme on top.) */
export const CUP_RADIUS_M = 0.3;
export const CUP_DROP_SPEED = 2.2;

export class GolfBallSim {
  readonly ball: SoccerBall;
  surface: Surface = 'fairway';
  /** wind: m/s vector, flat — applied through the air the ball flies in (see step). Zero by default. */
  wind = Vector3.Zero();
  /** 0 dry .. 1 soaked (WeatherKit.wet01): softer bounce, shorter roll. */
  wet01 = 0;
  /** Air density multiplier (WeatherKit.airDensityMult): rain is heavier air. */
  airDensity = 1;
  /** Where the ball first came down this shot (the CARRY point), null while airborne. */
  carryPoint: Vector3 | null = null;
  private wasAirborne = false;

  constructor(mesh: { position: Vector3 }) {
    this.ball = new SoccerBall(mesh, GOLF_BALL);
  }

  /** A raw launch: velocity + spin (GolfAim.launchVelocity builds both from a club, a power and an aim). */
  launch(from: Vector3, vel: Vector3, spin: Vector3): void {
    this.ball.launch(from, vel, spin);
    this.carryPoint = null; this.wasAirborne = true;
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
    this.launch(from, v, new Vector3(-shot.launchDeg * 0.28, shot.offlineRad * 220, 0));
  }

  /** Frame step on a surface map. Returns 'water' | 'ob' | 'ok'. */
  step(dt: number, surfaceAt: (p: Vector3) => Surface): 'water' | 'ob' | 'ok' {
    if (!this.ball.active) return 'ok';
    this.surface = surfaceAt(this.ball.pos);
    if (this.surface === 'water' || this.surface === 'ob') {
      this.ball.stop();
      return this.surface;
    }
    // surface friction drives the roll; wet turf grabs it, and a bounce on wet turf keeps less
    const wet = Math.max(0, Math.min(1, this.wet01));
    const friction = SURFACE_FRICTION[this.surface] * (1 + 0.6 * wet);
    (this.ball as unknown as { tune: BallTuning }).tune = {
      ...GOLF_BALL, grassFriction: friction, restitution: GOLF_BALL.restitution * (1 - 0.4 * wet), dragK: GOLF_BALL.dragK * this.airDensity,
      skidFactor: GOLF_BALL.skidFactor * (1 - 0.45 * wet),   // soaked turf plugs the ball: the bounce keeps far less of its run
    };
    const n = Math.max(1, Math.ceil(dt / MAX_STEP)); const h = dt / n;
    for (let i = 0; i < n && this.ball.active; i++) {
      if (!this.ball.rolling && this.wind.lengthSquared() > 0) {
        // relative-air drag: F = −k·|v−w|·(v−w) = −k|v−w| v + k|v−w| w — SoccerBall applies the first term against
        // still air; this is the second. A headwind (w against v) slows; a tailwind carries; a crosswind pushes.
        const rel = this.ball.vel.subtract(this.wind);
        this.ball.vel.addInPlace(this.wind.scale(WIND_GAIN * GOLF_BALL.dragK * this.airDensity * rel.length() * h));
      }
      const vyBefore = this.ball.vel.y;
      this.ball.step(h);
      // the CARRY is the first touch: SoccerBall clamps the ball onto the turf on a bounce and flips vy up (or starts it
      // rolling), so "was falling, now on the ground and not falling" is that touch and only that touch
      if (this.wasAirborne && !this.carryPoint && vyBefore < 0 && this.ball.vel.y >= 0 && this.ball.pos.y - GOLF_BALL.radius <= 0.011) this.carryPoint = this.ball.pos.clone();
    }
    return 'ok';
  }

  /** The cup takes a slow ball at the hole: it drops, and the sim stops with the ball sunk. */
  tryHole(holeX: number, holeZ: number): boolean {
    const b = this.ball; if (!b.active) return false;
    const flatSpeed = Math.hypot(b.vel.x, b.vel.z);
    const near = Math.hypot(b.pos.x - holeX, b.pos.z - holeZ) <= CUP_RADIUS_M;
    if (near && flatSpeed <= CUP_DROP_SPEED && b.pos.y - GOLF_BALL.radius < 0.06) {
      b.stop(); b.pos.set(holeX, -0.02, holeZ); b.mesh.position.copyFrom(b.pos);
      return true;
    }
    return false;
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
