// BallSpin — the ball TURNS (hoops detail pass, owner 2026-09-18: "an animation and detail pass for the dunk mode, 1v1,
// 3v3 and 3pt shoot out"). Every ball in the four hoops modes flew and bounced with its seams frozen: the Meshy leather
// rides the physics sphere, and nothing ever rotated the sphere. A jump shot carries BACKSPIN (about the axis across the
// flight, top of the ball turning toward the shooter — ~2 rev/s from a good release); a ball on the floor ROLLS at v / r.
// Pure rotation on a mesh; the modes own where the ball is.
import { Vector3, Space, type AbstractMesh } from '@babylonjs/core';

const UP = Vector3.Up();
/** Backspin on a shot in flight: `dir` is the flight's horizontal direction (from → rim), `revPerSec` the spin rate. */
export function spinBackspin(mesh: AbstractMesh, dir: { x: number; z: number }, dt: number, revPerSec = 2.2): void {
  const len = Math.hypot(dir.x, dir.z);
  if (len < 1e-4 || dt <= 0) return;
  // the axis across the flight: up × forward; a positive turn about it rolls the top of the ball BACK toward the shooter
  const axis = Vector3.Cross(UP, new Vector3(dir.x / len, 0, dir.z / len));
  mesh.rotate(axis, -revPerSec * Math.PI * 2 * dt, Space.WORLD);
}
/** The roll of a loose ball: the surface speed matches the floor (angle = distance / radius) about the axis across the travel. */
export function spinRoll(mesh: AbstractMesh, vel: { x: number; z: number }, radius: number, dt: number, airborne = false): void {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.05 || dt <= 0) return;
  const axis = Vector3.Cross(UP, new Vector3(vel.x / speed, 0, vel.z / speed));
  // in the air the roll keeps turning at the launch rate rather than freezing (a ball off the iron tumbles)
  mesh.rotate(axis, ((speed * dt) / Math.max(0.05, radius)) * (airborne ? 0.6 : 1), Space.WORLD);
}
