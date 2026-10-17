// H2c (hoops gameplay pass, owner 2026-10-16, decision 3): THE DEFENDER REACTS — a look and a small real effect, the ankle-break odds
// unchanged. Four reads of the handler's fakes, each a short step the defender's MOVER takes instead of his brain's wish (the mover's
// accel / brake caps hold, so no frame is harder than the AI-acceleration line — never a root write like the ankle bite's slide):
//
//   retreat — the jab he BOUGHT: a drop step back, ~0.3 m given up (the owner's number), under today's 0.3 s stun
//   shade   — the yoyo thrown at him: a small shade toward the ball's side (the high bounce he is guarding)
//   lunge   — a crossing move (or the in-and-out's feint) that did not break him: one committed step the WRONG way — toward the side the
//             ball left, the same side the ankle bite slides him — then the brain has him again
//   standup — the hesitation he was closing on: he comes up out of his stance and his slide stops for a beat
//
// The hesitation's BITE (the left-stick pull-back's 0.45 s stun) and the jab's are unchanged; a break (reactToBreak) keeps its own stumble
// and bite, so a move that broke him gets no lunge on top. Pure: the modes call `defReactionFor` with the geometry and step the result.
import type { HandleMove } from './HandleSystem';
import { MOVE_SHAPE } from './HandleShape';

export type DefReactKind = 'retreat' | 'shade' | 'lunge' | 'standup';
export interface DefReactTune {
  /** How long the reaction owns his feet (s). */
  sec: number;
  /** How far he goes along `dir` over it (m) — 0: he stops (the stand-up). */
  dist: number;
  /** The fastest the reaction asks for (m/s); the mover's accel / brake decide what he really does. */
  maxMps: number;
}
/** FEEL NUMBERS (new in H2c, flagged): the retreat's 0.3 m is the owner's; the rest are first guesses for the owner's eye. */
export const DEF_REACT: Readonly<Record<DefReactKind, DefReactTune>> = {
  retreat: { sec: 0.3, dist: 0.3, maxMps: 2.2 },
  shade: { sec: 0.25, dist: 0.2, maxMps: 1.6 },
  lunge: { sec: 0.22, dist: 0.25, maxMps: 2.4 },
  standup: { sec: 0.2, dist: 0, maxMps: 0 },
};
/** A reaction reads only a defender in front of the handler and close enough to bite (the hesi bite's own 2.4 m). */
export const DEF_REACT_RANGE = 2.4;
/** The stand-up reads a defender who was CLOSING (the hesi bite's own read: foeCloseMemory > 0.8 m/s). */
export const DEF_REACT_CLOSING_MPS = 0.8;

export interface DefReaction {
  kind: DefReactKind;
  /** Planar unit direction (world x / z); zero for the stand-up. */
  dir: { x: number; z: number };
  left: number;
  /** Metres still to go along `dir`. */
  togo: number;
  readonly tune: DefReactTune;
}

/** The moves whose ball path sells a side — a crossing (or a feint of one) that can pull him the wrong way. The spin and the steezo roll
 *  turn the body past him (their own shoulder clear), so they are not lunges. */
export function lungesOn(move: HandleMove): boolean {
  if (move === 'spin' || move === 'steezo_roll') return false;
  return MOVE_SHAPE[move].crosses > 0 || MOVE_SHAPE[move].path === 'feint';
}

export function startReaction(kind: DefReactKind, dir: { x: number; z: number } = { x: 0, z: 0 }): DefReaction {
  const tune = DEF_REACT[kind];
  const n = Math.hypot(dir.x, dir.z);
  const d = n > 1e-6 && tune.dist > 0 ? { x: dir.x / n, z: dir.z / n } : { x: 0, z: 0 };
  return { kind, dir: d, left: tune.sec, togo: tune.dist, tune };
}

/** This frame's wished velocity (m/s, world): what is left of the distance over what is left of the time, capped — so the step lands
 *  where it was aimed even through the mover's ramp; zero for the stand-up (a plant). */
export function reactionWish(r: DefReaction): { x: number; z: number } {
  if (r.togo <= 1e-4 || r.tune.dist <= 0) return { x: 0, z: 0 };
  const sp = Math.min(r.tune.maxMps, r.togo / Math.max(r.left, 0.05));
  return { x: r.dir.x * sp, z: r.dir.z * sp };
}

/** Advance one frame by the velocity the mover really gave him; null once it is over (the brain has him again). */
export function stepReaction(r: DefReaction, dt: number, vel: { x: number; z: number }): DefReaction | null {
  r.left -= dt;
  r.togo = Math.max(0, r.togo - Math.max(0, (vel.x * r.dir.x + vel.z * r.dir.z) * dt));
  return r.left > 1e-6 ? r : null;
}

export interface DefReadGeometry {
  /** The handler's planar position and yaw (athleteRight(yaw) is his right). */
  handler: { x: number; z: number };
  handlerYaw: number;
  /** The defender's planar position. */
  defender: { x: number; z: number };
  /** Can he react at all (not stunned by something else, not on the floor)? */
  live: boolean;
}
const rightOf = (yaw: number) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });   // athleteSide.athleteRight, planar
const inRange = (g: DefReadGeometry) => g.live && Math.hypot(g.defender.x - g.handler.x, g.defender.z - g.handler.z) < DEF_REACT_RANGE;

/** THE JAB he bought: back, away from the handler. */
export function retreatFrom(g: DefReadGeometry): DefReaction | null {
  if (!inRange(g)) return null;
  return startReaction('retreat', { x: g.defender.x - g.handler.x, z: g.defender.z - g.handler.z });
}
/** THE YOYO: toward the ball's side of the handler (`ballHand` the athlete's). */
export function shadeToward(g: DefReadGeometry, ballHand: 'left' | 'right'): DefReaction | null {
  if (!inRange(g)) return null;
  const r = rightOf(g.handlerYaw), s = ballHand === 'right' ? 1 : -1;
  return startReaction('shade', { x: r.x * s, z: r.z * s });
}
/** A CROSSING that did not break him: one step the wrong way. `biteDir` is the side the call site's ankle bite would slide him from
 *  (reactToBreak's moveDir): he goes the OTHER way along the handler's right — exactly the bite slide's direction, a smaller step. */
export function lungeFor(g: DefReadGeometry, move: HandleMove, biteDir: 'left' | 'right'): DefReaction | null {
  if (!lungesOn(move) || !inRange(g)) return null;
  const r = rightOf(g.handlerYaw), s = biteDir === 'right' ? -1 : 1;
  return startReaction('lunge', { x: r.x * s, z: r.z * s });
}
/** THE HESITATION he was closing on: he stands up, his slide stops for a beat. */
export function standUpOn(g: DefReadGeometry, closingMps: number): DefReaction | null {
  if (!inRange(g) || closingMps <= DEF_REACT_CLOSING_MPS) return null;
  return startReaction('standup');
}

/** The defender's clip for a reaction (authored in anim/authored/basketball.ts). `side` is the athlete's side he steps to (the lunge). */
export function reactClip(r: DefReaction, side: 'left' | 'right' = 'right'): string | null {
  switch (r.kind) {
    case 'retreat': return 'bball_def_retreat';
    case 'lunge': return `bball_def_lunge_${side}`;
    case 'standup': return 'bball_def_standup';
    default: return null;   // the shade is a slide step: his slide loop plays it from the velocity
  }
}

/** H2c (plan §3.7 / 4f): the ms from now to the defender's read of a move that just started — its path's readAtK, when the ball crosses —
 *  for the clip beat of a SOFT break (the stumble). The break's state (the stun, the bite) stays on the input frame; a hard break's
 *  slip stays there too (he is floored at once). Capped: a long path's read is not a beat late. 0 = beat now. */
export const READ_BEAT_MAX_MS = 300;
export function readBeatMs(move: { t: number; duration: number; readAtK: number | null } | null | undefined): number {
  if (!move || move.readAtK === null || !(move.duration > 0)) return 0;
  return Math.min(READ_BEAT_MAX_MS, Math.max(0, (move.readAtK * move.duration - move.t) * 1000));
}
