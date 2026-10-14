// Pure placement helpers for the hoops dressing (vis-hoops-dunk).

/** The yaw (about y) that turns a Babylon plane's FRONT (its −z side) toward the point `to`, from `from`. */
export function yawToward(from: { x: number; z: number }, to: { x: number; z: number }): number {
  const dx = to.x - from.x, dz = to.z - from.z;
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return Math.atan2(-dx, -dz);
}

/** The point `d` metres from `from` toward `to` on the ground plane (y kept from `from`). */
export function stepToward(from: { x: number; y: number; z: number }, to: { x: number; z: number }, d: number): { x: number; y: number; z: number } {
  const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
  return { x: from.x + (dx / l) * d, y: from.y, z: from.z + (dz / l) * d };
}
