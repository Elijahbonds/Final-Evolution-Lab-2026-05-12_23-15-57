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
  clockSec: 11, startZ: -8, keeperZ: 10.4, goalZ: 11,   // FIELD-DEPTH W4: longer breakaway run per kick
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
  /** A save inside reach comes back as a PARRY-KICK when the shot was at his body (inside `parryBodyM` of his centre —
   *  IMPROVE 2026-10-06, Penalty #8; TUNED: was a 45% roll on every save, so it could be neither read nor played around);
   *  a save at full stretch is held. Not in the last `parryMinClock` s (no time to hit it again), never off an overdrive.
   *  The counter's speed. */
  parryBodyM: 0.55, parryMinClock: 1.5, counterSpeed: 9,
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
/** IMPROVE (2026-10-06, Penalty #8): a save he makes inside reach — a shot at his body comes back at you (the parry-kick),
 *  one he stretches for is held. */
export function parryRead(ballX: number, keeperX: number, clock: number, kind: ShotKind): boolean {
  return Math.abs(ballX - keeperX) <= KEEPER.parryBodyM && clock > KEEPER.parryMinClock && kind !== 'overdrive';
}

// ── THE STICK AIMS (owner decision 2026-10-06, "Stick aims") ─────────────────────────────────────────────────────────
// IMPROVE (2026-10-06): the corner used to be read off the ball's distance ahead of the striker at the strike. Off the
// dribble the ball always rides BREAK.dribbleAhead (0.9 m) ahead, so every plain strike read ≈ x −0.1, low and just left
// of centre, whatever you did. Now the stick held at the strike picks it: ◀ the left corner, ▶ the right, neither the
// middle; up (the stick's negative y, as before) lifts it high — the chip. The distance stays as a secondary factor: a
// ball struck off the sweet spot of the dribble (jammed tight, or stretched for at full reach) wobbles off its line.
export type AimSide = -1 | 0 | 1;
export const AIM = {
  /** TUNED (2026-10-06, new): the stick past this either side picks that corner; inside it is the middle. */
  sideDeadZone: 0.35,
  /** The corner's line and the shot's two heights — the old distance read's ends (±3.0, low 0.85, high 1.9), unchanged. */
  cornerX: 3.0, lowY: 0.85, highY: 1.9,
  /** Stick up past this lifts it (the old `stickY < -0.5`, unchanged). */
  highStickY: -0.5,
  /** TUNED (2026-10-06, new): the wobble (launchKick's, ±1.2 m per unit) on a ball struck a full sweet-spot-to-reach
   *  away from the dribble's 0.9 m — at most ±0.3 m, a corner shot pulled toward the post or inside it. */
  stretchWobble: 0.25,
} as const;
/** The corner the stick picks: −1 left, +1 right, 0 the middle. */
export function stickAimSide(stickX: number): AimSide {
  return stickX <= -AIM.sideDeadZone ? -1 : stickX >= AIM.sideDeadZone ? 1 : 0;
}
/** How far off the dribble's sweet spot the ball was struck, 0 (on it) … 1 (a reach's worth off it). */
export function strikeStretch01(ballDist: number): number {
  return clamp(Math.abs(ballDist - BREAK.dribbleAhead) / (BREAK.strikeReach - BREAK.dribbleAhead), 0, 1);
}
export interface StrikeAim { side: AimSide; high: boolean; target: { x: number; y: number }; wobble: number }
/** The plain strike's aim off the stick held at the strike, and its wobble off the ball's distance. The tricks shape it
 *  further in the mode (the curler, the rainbow, the bank) from this side and height. */
export function strikeAim(stick: { x: number; y: number }, ballDist: number): StrikeAim {
  const side = stickAimSide(stick.x);
  const high = stick.y < AIM.highStickY;
  return { side, high, target: { x: side * AIM.cornerX, y: high ? AIM.highY : AIM.lowY }, wobble: strikeStretch01(ballDist) * AIM.stretchWobble };
}
/** Where the keeper dives on the breakaway shot. Read right, he goes to the shot's line (inside the post); read wrong,
 *  2 m the other way — and on a shot down the middle, read wrong is a dive to either side (`rand` picks it), where
 *  before `−side × 2` left him standing on a middle shot he had misread. */
export function keeperDiveX(correct: boolean, side: AimSide, aimX: number, keeperX: number, rand: number): number {
  if (correct) return clamp(aimX, -2.9, 2.9);
  const away = side !== 0 ? -side : rand < 0.5 ? -1 : 1;
  return keeperX + away * 2.0;
}
