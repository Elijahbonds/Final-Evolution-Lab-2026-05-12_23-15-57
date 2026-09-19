// PARKOUR GOLF — the links hole as a party puzzle (owner brief, 2026-09-18: "Parkour Golf — target drop + trick-putt arena").
//
// Pure reads on the hole the golf mode already plays (a tee, a pin, the WiiGolf swing):
//   · THE LAUNCH PAD. A springboard hop behind the ball before the swing augments the strike (power off the launch position).
//   · THE FLICKS. Mid-air stick flicks bend the ball — twice a shot — around the turbine, through the score rings.
//   · THE RINGS. Two score rings float on the hole's line; passing through one pays, both in one flight pays double.
//   · THE TURBINE. A fan on the fairway gusts the ball sideways inside its zone (the obstacle to bend around).
//   · THE BANK. The green is ringed by a banked half-pipe: a putt that runs out into it rides back toward the cup — a
//     SLIDE PUTT (LT held) rides it harder.

export interface P2 { x: number; z: number }
export interface P3 { x: number; y: number; z: number }

export const PAD = { springboard: { mult: 1.15, label: 'SPRINGBOARD' }, wallramp: { mult: 1.25, label: 'WALL RAMP' } } as const;
export type PadKind = keyof typeof PAD;
export function padMult(kind: PadKind | null): number { return kind ? PAD[kind].mult : 1; }

export const FLICK = { perShot: 2, impulse: 3.5, edge: 0.7, rearm: 0.3 } as const;
/** A flick is an EDGE: the stick crossing from near centre to past `edge` — with a flick left to spend. */
export function flickRead(prevX: number, x: number, left: number): -1 | 0 | 1 {
  if (left <= 0) return 0;
  if (Math.abs(prevX) >= FLICK.rearm) return 0;
  if (x >= FLICK.edge) return 1;
  if (x <= -FLICK.edge) return -1;
  return 0;
}
/** The impulse: sideways to the flight (dir +1 = the flight's right). */
export function flickVel(vel: P2, dir: -1 | 1): P2 {
  const s = Math.hypot(vel.x, vel.z) || 1;
  return { x: (vel.z / s) * dir * FLICK.impulse, z: (-vel.x / s) * dir * FLICK.impulse };
}

export interface Ring { id: string; x: number; y: number; z: number; r: number }
export const RINGS = { at: [0.45, 0.75] as readonly number[], y: [3.2, 2.4] as readonly number[], r: 2.2, pts: 50, chainMult: 2 } as const;   // the in-bounds shots on these holes apex 2–3 m (measured); 5 / 3.5 floated over them
/** Two rings on the line from the tee to the pin. */
export function ringsFor(tee: P2, hole: P2): Ring[] {
  return RINGS.at.map((k, i) => ({ id: `ring${i}`, x: tee.x + (hole.x - tee.x) * k, y: RINGS.y[i], z: tee.z + (hole.z - tee.z) * k, r: RINGS.r }));
}
/** The ball's step crossed the ring's plane (the plane across the hole's line) inside its radius. */
export function ringPass(prev: P3, pos: P3, ring: Ring, line: P2): boolean {
  const n = Math.hypot(line.x, line.z) || 1, nx = line.x / n, nz = line.z / n;
  const a = (prev.x - ring.x) * nx + (prev.z - ring.z) * nz, b = (pos.x - ring.x) * nx + (pos.z - ring.z) * nz;
  if (!(a < 0 && b >= 0)) return false;
  const k = a / (a - b);
  const cx = prev.x + (pos.x - prev.x) * k, cy = prev.y + (pos.y - prev.y) * k, cz = prev.z + (pos.z - prev.z) * k;
  const lateral = (cx - ring.x) * nz - (cz - ring.z) * nx;
  return Math.hypot(lateral, cy - ring.y) <= ring.r;
}

export const TURBINE = { at: 0.6, side: 3.5, zoneR: 4, gust: 7 } as const;
export function turbineFor(tee: P2, hole: P2): P2 {
  const n = Math.hypot(hole.x - tee.x, hole.z - tee.z) || 1, nx = (hole.x - tee.x) / n, nz = (hole.z - tee.z) / n;
  return { x: tee.x + (hole.x - tee.x) * TURBINE.at + nz * TURBINE.side, z: tee.z + (hole.z - tee.z) * TURBINE.at - nx * TURBINE.side };
}
/** The gust inside the fan's zone: away from the fan, across the line. */
export function gustAt(pos: P2, fan: P2): P2 | null {
  const dx = pos.x - fan.x, dz = pos.z - fan.z, d = Math.hypot(dx, dz);
  if (d > TURBINE.zoneR || d < 1e-3) return null;
  const k = TURBINE.gust * (1 - d / TURBINE.zoneR);
  return { x: (dx / d) * k, z: (dz / d) * k };
}

export const BANK = { innerR: 4.6, outerR: 5.9, keep: 0.8, pull: 0.35, slidePull: 0.75, minOut: 0.3, pts: 40 } as const;
/** The half-pipe around the green: a ball running OUT through the band comes back, curled toward the cup. Null = not on it. */
export function bankReflect(pos: P2, vel: P2, hole: P2, slide: boolean): P2 | null {
  const dx = pos.x - hole.x, dz = pos.z - hole.z, d = Math.hypot(dx, dz);
  if (d < BANK.innerR || d > BANK.outerR) return null;
  const rx = dx / d, rz = dz / d;
  const out = vel.x * rx + vel.z * rz;
  if (out < BANK.minOut) return null;
  const s = Math.hypot(vel.x, vel.z);
  const vx = (vel.x - 2 * out * rx) * BANK.keep, vz = (vel.z - 2 * out * rz) * BANK.keep;
  const pull = (slide ? BANK.slidePull : BANK.pull) * s;
  return { x: vx - rx * pull, z: vz - rz * pull };
}
