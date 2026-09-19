// CHOKEPOINT COURT — the 3v3 court that funnels the play (owner brief, 2026-09-18: "Team Slipstream & Synergy Overdrive",
// the deferred half: "a chokepoint court layout").
//
// Pure reads on the half court the 3v3 plays (x ±8, z 0.5..15, the rim at z ≈ −0.6 → the lane runs down toward it):
//   · THE RAILS. Two rails flank the lane and two wings close the corners: bodies cannot pass through them (an AABB
//     resolve after the court's own clamp), and a run ALONG one at speed is a RAIL RUN — faster, and a slipstream's
//     natural home.
//   · THE LANE. Between the rails the offense is funnelled: drafting behind a mate there fills the synergy twice as fast.

export interface Rail { id: string; x: number; z: number; halfX: number; halfZ: number; h: number }
export const CHOKE = {
  lane: { halfX: 2.4, z0: 3.5, z1: 8.5 },
  /** Drafting inside the lane fills the gauge this much faster. */
  draftGain: 2,
  /** A run along a rail: this fast, this close to its face, moving mostly along it — the speed it buys and for how long. */
  railMinSpeed: 4, railNearM: 0.75, railAlongCos: 0.85, railMult: 1.15, railCallSec: 1.2,
} as const;
export const CHOKE_RAILS: readonly Rail[] = [
  { id: 'rail-l', x: -3.1, z: 6.0, halfX: 0.3, halfZ: 2.6, h: 1.0 },
  { id: 'rail-r', x: 3.1, z: 6.0, halfX: 0.3, halfZ: 2.6, h: 1.0 },
  { id: 'wing-l', x: -6.3, z: 10.5, halfX: 1.4, halfZ: 0.3, h: 0.9 },
  { id: 'wing-r', x: 6.3, z: 10.5, halfX: 1.4, halfZ: 0.3, h: 0.9 },
];
/** `?choke=1` turns the layout on. */
export function readChoke(search: string): boolean {
  try { const v = new URLSearchParams(search).get('choke'); return v === '1' || v === 'true' || v === 'on'; } catch { return false; }
}
/** Push a body (a disc of `radius`) out of any rail it overlaps, along the shallower axis. Returns the rail it left, or null. */
export function resolveRails(pos: { x: number; z: number }, radius: number, rails: readonly Rail[] = CHOKE_RAILS): Rail | null {
  let hit: Rail | null = null;
  for (const r of rails) {
    const dx = pos.x - r.x, dz = pos.z - r.z;
    const px = r.halfX + radius - Math.abs(dx), pz = r.halfZ + radius - Math.abs(dz);
    if (px <= 0 || pz <= 0) continue;
    if (px < pz) pos.x = r.x + Math.sign(dx || 1) * (r.halfX + radius);
    else pos.z = r.z + Math.sign(dz || 1) * (r.halfZ + radius);
    hit = r;
  }
  return hit;
}
export function inChokeLane(pos: { x: number; z: number }): boolean {
  return Math.abs(pos.x) <= CHOKE.lane.halfX && pos.z >= CHOKE.lane.z0 && pos.z <= CHOKE.lane.z1;
}
/** Beside a rail's long face, running along it at speed: the rail. */
export function railRunRead(pos: { x: number; z: number }, vel: { x: number; z: number }, rails: readonly Rail[] = CHOKE_RAILS): Rail | null {
  const s = Math.hypot(vel.x, vel.z);
  if (s < CHOKE.railMinSpeed) return null;
  for (const r of rails) {
    const longIsZ = r.halfZ >= r.halfX;
    const along = longIsZ ? Math.abs(vel.z) / s : Math.abs(vel.x) / s;
    if (along < CHOKE.railAlongCos) continue;
    const beside = longIsZ
      ? Math.abs(pos.z - r.z) <= r.halfZ && Math.abs(Math.abs(pos.x - r.x) - r.halfX) <= CHOKE.railNearM
      : Math.abs(pos.x - r.x) <= r.halfX && Math.abs(Math.abs(pos.z - r.z) - r.halfZ) <= CHOKE.railNearM;
    if (beside) return r;
  }
  return null;
}
