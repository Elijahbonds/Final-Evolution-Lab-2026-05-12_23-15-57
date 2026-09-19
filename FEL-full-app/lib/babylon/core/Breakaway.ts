// BREAKAWAY — the soccer shootout as a striker-vs-keeper run (owner brief, 2026-09-18: "Soccer Shootout" + "Parkour Soccer").
//
// The striker starts at midfield with the ball at his feet and a shot clock; the keeper is agile. Pure reads:
//   · KINETIC SHOT STACKING. A flow gauge (wall runs, rebounds, slides, a fast dribble) sets the shot's power; a wall run,
//     a rebound or a slide inside `kineticSec` of the contact stacks speed into the ball.
//   · THE STRIKER'S TRICKS. The BANK (R1 on the glass: the shot mirrored off the side wall), the RAINBOW FLICK (A with the
//     keeper right in front: over his shoulders, the ball chipped over him), the SLIDE-CANCEL CURLER (LT then A: the slide
//     feinted into an instant curler).
//   · THE KEEPER'S ANSWERS. He comes off his line, slide-tackles a striker who dawdles inside his range, vaults for the
//     top corners near a post, and can PARRY-KICK a save back at the striker — whose re-strike inside the clock (like a
//     rebound off the frame) is an OVERDRIVE shot.

export interface P2 { x: number; z: number }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const BREAK = {
  clockSec: 9, startZ: -8, keeperZ: 10.4, goalZ: 11,
  /** The curved glass down each side; a run INTO it at speed goes up it. */
  glassX: 7.6, glassWindow: 0.9, glassMinSpeed: 4.5, wallRunSec: 1.2, wallRunMult: 1.15, wallRunY: 0.5,
  /** The ball rides this far ahead of the feet; a shot needs it inside `strikeReach`. */
  dribbleAhead: 0.9, strikeReach: 1.7,
  /** The slide: its length, its cooldown, and the window after its start in which A cancels it into the curler. */
  slideSec: 0.45, slideCool: 1.2, cancelWindow: 0.35, slideMult: 1.1,
  /** The rainbow: the keeper this far ahead on the line, this close to it. */
  rainbowAhead: [0.8, 2.4] as readonly [number, number], rainbowLateral: 1.0, rainbowSec: 0.55, rainbowUp: 1.2, rainbowForward: 2.6,
} as const;

export const FLOW = { wallRun: 35, rebound: 30, slide: 15, bank: 20, rainbow: 25, dribblePerSec: 6, full: 100, kineticSec: 1.2, kineticMult: 1.2, overdriveMult: 1.3 } as const;
export function flowAdd(gauge: number, n: number): number { return clamp(gauge + n, 0, FLOW.full); }

export type ShotKind = 'strike' | 'bank' | 'rainbow' | 'curler' | 'overdrive';
export interface ShotProfile { power01: number; speedMult: number; label: string }
/** The shot's power off the flow, with the kinetic stack and the overdrive on top. */
export function shotProfile(flow01: number, kinetic: boolean, kind: ShotKind): ShotProfile {
  const f = clamp(flow01, 0, 1);
  const base = kind === 'rainbow' ? 0.62 : 0.55 + 0.35 * f;
  const speedMult = (kinetic ? FLOW.kineticMult : 1) * (kind === 'overdrive' ? FLOW.overdriveMult : 1);
  const label = kind === 'overdrive' ? 'OVERDRIVE SHOT' : kind === 'bank' ? 'BANK VOLLEY' : kind === 'rainbow' ? 'RAINBOW FLICK' : kind === 'curler' ? 'SLIDE-CANCEL CURLER' : kinetic ? 'KINETIC STRIKE' : f >= 0.7 ? 'FLOW STRIKE' : 'STRIKE';
  return { power01: clamp(base, 0, 1), speedMult, label };
}

/** Running into the side glass at speed: the side, or 0. */
export function glassRead(x: number, vx: number, vz: number): 1 | -1 | 0 {
  const side = Math.sign(x) as 1 | -1 | 0;
  if (side === 0 || Math.abs(x) < BREAK.glassX - BREAK.glassWindow) return 0;
  if (Math.sign(vx) !== side) return 0;
  return Math.hypot(vx, vz) >= BREAK.glassMinSpeed ? side : 0;
}
/** The bank: aim at the goal's MIRROR image across the glass and the reflection brings it back to the real one. */
export function bankTarget(side: 1 | -1, target: { x: number; y: number }): { x: number; y: number } {
  return { x: 2 * side * BREAK.glassX - target.x, y: target.y };
}
/** The keeper right in front on my line: A goes over his shoulders. */
export function rainbowRead(me: P2, meVel: P2, keeper: P2): boolean {
  const s = Math.hypot(meVel.x, meVel.z); if (s < 3) return false;
  const fx = meVel.x / s, fz = meVel.z / s, dx = keeper.x - me.x, dz = keeper.z - me.z;
  const along = dx * fx + dz * fz, lateral = Math.abs(dx * fz - dz * fx);
  return along >= BREAK.rainbowAhead[0] && along <= BREAK.rainbowAhead[1] && lateral <= BREAK.rainbowLateral;
}
/** A inside the first beat of a slide cancels it into the curler. */
export function slideCancelRead(slideSec: number): boolean { return slideSec >= 0 && slideSec <= BREAK.cancelWindow; }
/** The rainbow's arc over the keeper. */
export function rainbowArc(from: { x: number; y: number; z: number }, dir: P2, u: number): { x: number; y: number; z: number } {
  const n = Math.hypot(dir.x, dir.z) || 1;
  return { x: from.x + (dir.x / n) * BREAK.rainbowForward * u, y: from.y + Math.sin(u * Math.PI) * BREAK.rainbowUp, z: from.z + (dir.z / n) * BREAK.rainbowForward * u };
}

export const KEEPER = {
  /** He comes off his line to this far in front of the striker, never past `closeMinZ`, at `closeRate` m/s. */
  closeLead: 4.5, closeMinZ: 6.0, closeRate: 3.5, trackX: 0.7,
  /** The slide-tackle: the ball inside `slideDist`, a lunge of `slideSec` at `slideSpeed`; the ball inside `slideHitM` is his. */
  slideDist: 2.8, slideSec: 0.45, slideSpeed: 7.5, slideHitM: 0.8, slideCool: 2.2,
  /** Near a post a high shot is met with the crossbar vault. */
  vaultNearPost: 2.0, vaultReachMult: 1.4,
  /** A save inside reach comes back as a PARRY-KICK this often; the counter's speed. */
  parryChance: 0.45, counterSpeed: 9,
  /** What the tricks do to his reach. */
  overdriveReachMult: 0.6, rainbowReachMult: 0.5,
} as const;
export function keeperTargetZ(strikerZ: number): number { return clamp(strikerZ + KEEPER.closeLead, KEEPER.closeMinZ, BREAK.keeperZ); }
export function keeperSlideRead(keeper: P2, ball: P2, cool: number, struck: boolean): boolean {
  if (struck || cool > 0) return false;
  return Math.hypot(ball.x - keeper.x, ball.z - keeper.z) <= KEEPER.slideDist;
}
/** His reach on this shot. */
export function reachFor(base: number, shot: { high: boolean; kind: ShotKind }, nearPost: boolean): number {
  let r = base;
  if (shot.high && nearPost) r *= KEEPER.vaultReachMult;
  if (shot.kind === 'overdrive') r *= KEEPER.overdriveReachMult;
  if (shot.kind === 'rainbow') r *= KEEPER.rainbowReachMult;
  return r;
}
/** The ball crossed the keeper's depth this step. */
export function crossesKeeper(prevZ: number, z: number, keeperZ: number): boolean { return prevZ < keeperZ && z >= keeperZ; }
