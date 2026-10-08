/**
 * The wall run (lane A1; docs/ADVENTURE-PLAN.md "movement/wallrun.ts"), on core/MatrixFocus's walls.
 *
 * Jump while running INTO a wall (MatrixFocus.wallRunAvailableOn: inside its reach, heading against its normal) at a
 * sprint (FreeRunCore's 5.2 m/s gate) and you run along it on MatrixFocus's arc for WALL_RUN.sec, then drop off its end
 * with your speed. Jump again on the wall to kick off it, out and up, with the air dash back.
 *
 * One change from MatrixFocus: its run is a fixed 5.6 m/s, which would brake a 12 m/s runner to a walk on the wall.
 * The run keeps the entry speed (never below 5.6); wallrun.test.ts pins the pose to wallRunOnAt at MatrixFocus's speed.
 */

import type { AdventureActor, MoveInput, WallSegment } from '../contracts';
import { WALL_RUN, startWallRunOn, wallRunAvailableOn, type WallRunOn } from '@/lib/babylon/core/MatrixFocus';
import type { BodyState, StepEnv } from './body';
import { yawOf } from './math';
import { enterState } from './state';

export interface WallPose { x: number; y: number; z: number; yaw: number; done: boolean }
export const wallPose = (): WallPose => ({ x: 0, y: 0, z: 0, yaw: 0, done: false });

/** MatrixFocus.wallRunOnAt at `speed`, lifted by `baseY`, written into `out`. */
export function wallRunPose(r: WallRunOn, speed: number, t: number, baseY: number, out: WallPose): WallPose {
  const w = r.wall;
  const tt = Math.min(WALL_RUN.sec, Math.max(0, t));
  const abx = w.b.x - w.a.x, abz = w.b.z - w.a.z, len = r.len || 1;
  const tx = abx / len, tz = abz / len;
  const sRaw = r.s0 + r.dir * speed * tt;
  const s = Math.max(0.3, Math.min(len - 0.3, sRaw));
  const atEnd = sRaw !== s;
  const u = tt / WALL_RUN.sec;
  const y = Math.min(w.height - 0.2, WALL_RUN.height * Math.sin(u * Math.PI) * (0.55 + 0.45 * (1 - u)));
  out.x = w.a.x + tx * s + w.nx * WALL_RUN.inset;
  out.z = w.a.z + tz * s + w.nz * WALL_RUN.inset;
  out.y = baseY + y;
  out.yaw = Math.atan2(tx * r.dir, tz * r.dir);
  out.done = t >= WALL_RUN.sec || atEnd;
  return out;
}

/** Take the wall if one is there and the run is fast enough. */
export function tryWallRun(a: AdventureActor, b: BodyState, env: StepEnv): boolean {
  const planar = Math.hypot(a.vel.x, a.vel.z);
  if (planar < env.p.wall.minSpeed || env.world.walls.length === 0) return false;
  const heading = { x: a.vel.x, z: a.vel.z };
  const hit = wallRunAvailableOn<WallSegment>(a.pos, heading, env.world.walls);
  if (!hit) return false;
  b.wall = startWallRunOn(hit, heading);
  b.wallT = 0;
  b.wallSpeed = Math.max(WALL_RUN.speed, planar);
  b.wallBaseY = a.pos.y;
  b.spinning = false; b.rising = false; b.homingId = null; b.airDashT = 0;
  a.grounded = false;
  enterState(a, 'wallrun', env.bus);
  return true;
}

const pose = wallPose();

export function stepWallRun(a: AdventureActor, b: BodyState, inp: MoveInput, env: StepEnv, dt: number): void {
  const r = b.wall!;
  b.wallT += dt;
  const prevY = a.pos.y;
  wallRunPose(r, b.wallSpeed, b.wallT, b.wallBaseY, pose);
  const w = r.wall, len = r.len || 1;
  const tx = ((w.b.x - w.a.x) / len) * r.dir, tz = ((w.b.z - w.a.z) / len) * r.dir;
  a.pos.x = pose.x; a.pos.y = pose.y; a.pos.z = pose.z;
  a.facingYaw = pose.yaw;
  a.vel.x = tx * b.wallSpeed; a.vel.z = tz * b.wallSpeed; a.vel.y = dt > 0 ? (pose.y - prevY) / dt : 0;
  if (inp.jump) {
    // The kick: out along the wall's normal and up, keeping most of the run.
    const k = env.p.wall;
    a.vel.x = tx * b.wallSpeed * 0.85 + w.nx * k.kickOut;
    a.vel.z = tz * b.wallSpeed * 0.85 + w.nz * k.kickOut;
    a.vel.y = k.kickUp;
    a.facingYaw = yawOf(a.vel.x, a.vel.z);
    b.wall = null;
    b.airDashes = 1; b.rising = true; b.spinning = true; b.coyote = Infinity; b.jumpedAt = env.tSec;
    enterState(a, 'air', env.bus);
    return;
  }
  if (pose.done) {
    a.vel.y = 0;
    b.wall = null;
    b.coyote = Infinity;
    enterState(a, 'air', env.bus);
  }
}
