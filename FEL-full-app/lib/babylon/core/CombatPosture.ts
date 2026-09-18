// CombatPosture — the Posture Poses windows for the combat family (BIOMECH-WAVE2, 2026-09-09): Karate Endless, Karate VS
// and Mixed Combat. The pure half, exactly as HoopsPosture is for the basketball family: a STANCE TABLE per combat
// window, the feet per window, and the resolver from the fight state each mode already has. The writer is the shared
// anim/PostureLayer (the dunk's).
//
// Why the family needs one at all (measured on 2942860, per rendered frame): every karate clip in the library keys the
// hips, ONE spine bone and the arms — `karate_guard_step`, `karate_block`, `karate_idle_stance` and the mocap strikes
// never touch Spine1 / Spine2 / the clavicles / the head. So the thoracic chain and the head sat at whatever the LAST
// clip that keyed them left: a fighter circling his opponent carried the previous jab's shoulder turn through the whole
// orbit, and NOBODY in the family ever looked at anybody — the head pointed down the root's yaw and the root's yaw is
// the lock-on, so the eyes tracked the hips, not the fists. A fight is read off the chest and the eyes.
//
// Sport flavour (SPEC-FEL-BIOMECH-GAMEWIDE, "Combat — G1 = foe/ring; G5 = KO/ring-out readable"):
//   · the GUARD squares the chest to the foe and puts the eyes on him — the one window where chestAim is full;
//   · a STRIKE turns the chest THROUGH the line (the clip's own hip/shoulder rotation is what throws the punch, so the
//     aim backs off to 0.3–0.45: squaring it to the foe mid-swing would cancel the rotation that IS the strike);
//   · a REACT breaks the chest away from the blow and drops the eyes (chestAim 0: a body absorbing a hit is not
//     tracking you), and the KNOCKDOWN / FLOOR hand the body back to the clip entirely (weight 0 — the layer must never
//     stand a floored fighter's chest up);
//   · the DODGE and the LEAN keep the eyes ON him through the slip (that read is the whole point of a bullet-time
//     window), and the CELEBRATE opens the chest away from the fight.
import { POSTURE, clamp, type PosturePose } from './DunkPosture';
import { LEGS, type LegPose } from './DunkLegs';

export type CombatWindow =
  | 'idle' | 'guard' | 'advance' | 'strafe' | 'retreat'
  | 'windup' | 'strike_light' | 'strike_medium' | 'strike_heavy' | 'strike_finisher'
  | 'block' | 'parry' | 'guard_impact'
  | 'react' | 'launch' | 'knockdown' | 'floor' | 'get_up'
  | 'dodge' | 'celebrate';

const P = (p: Omit<PosturePose, 'hipYawKeep'> & { hipYawKeep?: number }): PosturePose => ({ hipYawKeep: 1, ...p });

export const COMBAT_POSTURE: Record<CombatWindow, PosturePose> = {
  // out of the fight: tall, the chest half-open, a glance at whoever is nearest
  idle:            P({ lean: 2,  spine1: [2, 0, 0],   spine2: [-4, 0, 0],  neck: [-2, 0, 0], head: [-6, 0, 0],  shrug: 0,  forward: 0,  eyes: 0.6, chestAim: 0.3,  weight: 0.6 }),
  // THE GUARD: the fighting stance. Low lumbar, chest square on him, shoulders up under the hands, eyes on him.
  guard:           P({ lean: 8,  spine1: [7, 0, 0],   spine2: [-4, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 6,  forward: 5,  eyes: 1,   chestAim: 1,    weight: 0.9 }),
  // closing: the same guard leaning in behind the lead foot
  advance:         P({ lean: 12, spine1: [9, 0, 0],   spine2: [-4, 0, 0],  neck: [-5, 0, 0], head: [-10, 0, 0], shrug: 6,  forward: 5,  eyes: 1,   chestAim: 1,    weight: 0.9 }),
  // circling: the chest STAYS on him while the feet go sideways (the read the whole lock-on grammar depends on)
  strafe:          P({ lean: 7,  spine1: [6, 0, 0],   spine2: [-5, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 6,  forward: 4,  eyes: 1,   chestAim: 1,    weight: 0.95 }),
  // giving ground: weight back, chin tucked, still watching
  retreat:         P({ lean: 2,  spine1: [2, 0, 0],   spine2: [-6, 0, 0],  neck: [-2, 0, 0], head: [-4, 0, 0],  shrug: 7,  forward: 6,  eyes: 1,   chestAim: 0.9,  weight: 0.9 }),
  // the telegraph an agent shows before it swings: coiled, shoulder loaded back, eyes locked
  windup:          P({ lean: 6,  spine1: [5, 0, 0],   spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 8,  forward: 2,  eyes: 1,   chestAim: 0.7,  weight: 0.85 }),
  // the strikes: the clip's own rotation throws the punch — the layer keeps the spine tall and the eyes on the target
  // and stays OUT of the yaw (chestAim low, hipYawKeep 1: the hips are the strike)
  strike_light:    P({ lean: 5,  spine1: [4, 0, 0],   spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-6, 0, 0],  shrug: 8,  forward: 0,  eyes: 1,   chestAim: 0.45, weight: 0.8 }),
  strike_medium:   P({ lean: 4,  spine1: [2, 0, 0],   spine2: [-8, 0, 0],  neck: [-4, 0, 0], head: [-6, 0, 0],  shrug: 10, forward: -2, eyes: 1,   chestAim: 0.35, weight: 0.8 }),
  strike_heavy:    P({ lean: 8,  spine1: [8, 0, 0],   spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 10, forward: 2,  eyes: 1,   chestAim: 0.35, weight: 0.85 }),
  strike_finisher: P({ lean: 6,  spine1: [6, 0, 0],   spine2: [-10, 0, 0], neck: [-6, 0, 0], head: [-10, 0, 0], shrug: 12, forward: 0,  eyes: 1,   chestAim: 0.3,  weight: 0.9 }),
  // the guard: shoulders up and rounded, chin behind them, chest still on him
  block:           P({ lean: 6,  spine1: [8, 0, 0],   spine2: [-2, 0, 0],  neck: [4, 0, 0],  head: [6, 0, 0],   shrug: 14, forward: 10, eyes: 0.8, chestAim: 1,    weight: 1 }),
  parry:           P({ lean: 4,  spine1: [4, 0, 0],   spine2: [-6, 0, 0],  neck: [-2, 0, 0], head: [-4, 0, 0],  shrug: 10, forward: 2,  eyes: 1,   chestAim: 0.9,  weight: 0.9 }),
  guard_impact:    P({ lean: 10, spine1: [12, 0, 0],  spine2: [4, 0, 0],   neck: [6, 0, 0],  head: [8, 0, 0],   shrug: 14, forward: 12, eyes: 0.4, chestAim: 0.7,  weight: 1 }),
  // taking one: the chest breaks AWAY and the eyes come off him — a body absorbing a blow is not tracking you
  react:           P({ lean: 0,  spine1: [6, 0, 0],   spine2: [8, 0, 0],   neck: [8, 0, 0],  head: [10, 0, 0],  shrug: 4,  forward: 8,  eyes: 0,   chestAim: 0,    weight: 0.55 }),
  launch:          P({ lean: -6, spine1: [-8, 0, 0],  spine2: [-6, 0, 0],  neck: [8, 0, 0],  head: [10, 0, 0],  shrug: 2,  forward: -4, eyes: 0,   chestAim: 0,    weight: 0.4 }),
  // the floor: the clip owns the body outright. The layer standing a knocked-down chest back up is the single worst
  // thing it can do, so these are weight 0 — the same rule HoopsPosture's `floor` carries.
  knockdown:       P({ lean: 0,  spine1: [0, 0, 0],   spine2: [0, 0, 0],   neck: [0, 0, 0],  head: [0, 0, 0],   shrug: 0,  forward: 0,  eyes: 0,   chestAim: 0,    weight: 0 }),
  floor:           P({ lean: 0,  spine1: [0, 0, 0],   spine2: [0, 0, 0],   neck: [0, 0, 0],  head: [0, 0, 0],   shrug: 0,  forward: 0,  eyes: 0,   chestAim: 0,    weight: 0 }),
  // rising: the chest comes up first and the eyes find him again on the way (the read that says "he is back")
  get_up:          P({ lean: 14, spine1: [10, 0, 0],  spine2: [-2, 0, 0],  neck: [-6, 0, 0], head: [-10, 0, 0], shrug: 4,  forward: 4,  eyes: 0.8, chestAim: 0.4,  weight: 0.5 }),
  // the slip: the body goes, the eyes STAY on him — that is the whole read of a bullet-time window
  dodge:           P({ lean: 8,  spine1: [6, 0, 0],   spine2: [-4, 0, 0],  neck: [-4, 0, 0], head: [-6, 0, 0],  shrug: 6,  forward: 2,  eyes: 1,   chestAim: 0.5,  weight: 0.7 }),
  celebrate:       POSTURE.celebrate,
};

const L = (footPitch: number, weight: number, toeCurl = 0): LegPose => ({ footPitch, toeCurl, weight });
// The feet. The stance / guard / block clips are POSE clips: they solve the legs to an ankle target and never key the
// foot bone, so a fighter held whatever foot the last strike left him on — measured on the shipped hero, a roundhouse's
// swing foot stayed pointed 30° down through the guard that followed it. Standing windows flatten the sole; the floor
// family hands the feet back to the clip.
export const COMBAT_LEGS: Record<CombatWindow, LegPose> = {
  idle: L(0, 0.5), guard: L(0, 0.7), advance: L(0, 0.5), strafe: L(0, 0.7), retreat: L(0, 0.6),
  windup: L(0, 0.6), strike_light: L(0, 0.3), strike_medium: L(0, 0), strike_heavy: L(0, 0.3), strike_finisher: L(0, 0),
  block: L(0, 0.8), parry: L(0, 0.6), guard_impact: L(0, 0.7),
  react: L(0, 0.2), launch: L(-20, 0.4), knockdown: L(0, 0), floor: L(0, 0), get_up: L(0, 0.3),
  dodge: L(0, 0), celebrate: LEGS.celebrate,
};

// ── The window resolver ────────────────────────────────────────────────────
/** What the mode already knows about a fighter this frame. Deliberately the SAME shape the CombatAnimTree is fed, so a
 *  mode builds one object and hands it to both (the tree picks the clip, this picks the body under it). */
export interface CombatPostureInput {
  /** 0..1 of top speed. */
  speed01: number;
  /** −1 stepping left / +1 right / 0 forward-or-back, from Biomech.strafeAxis. */
  strafe: -1 | 0 | 1;
  /** Closing on him (+1), giving ground (−1), or neither. */
  approach: -1 | 0 | 1;
  striking: 'light' | 'medium' | 'heavy' | 'finisher' | null;
  windingUp: boolean;
  blocking: boolean;
  parrying: boolean;
  guardImpact: boolean;
  /** Taking one: 'light' | 'medium' | 'heavy' flinch, 'finisher' launches. */
  hitBy: 'light' | 'medium' | 'heavy' | 'finisher' | null;
  down: boolean;
  out: boolean;
  rising: boolean;
  dodging: boolean;
  celebrating: boolean;
  /** In a fight at all (an idle body outside a round reads `idle`, not `guard`). */
  engaged: boolean;
}
export const COMBAT_INPUT_IDLE: CombatPostureInput = {
  speed01: 0, strafe: 0, approach: 0, striking: null, windingUp: false, blocking: false, parrying: false,
  guardImpact: false, hitBy: null, down: false, out: false, rising: false, dodging: false, celebrating: false, engaged: false,
};

/** Speed past which a guarding fighter is MOVING (the tree's own walk line is 0.15). */
export const COMBAT_MOVE_SPEED01 = 0.15;

export function combatWindow(i: CombatPostureInput): CombatWindow {
  if (i.out || i.down) return 'floor';               // the clip owns a floored body outright
  if (i.rising) return 'get_up';
  if (i.hitBy) return i.hitBy === 'finisher' ? 'launch' : 'react';
  if (i.dodging) return 'dodge';
  if (i.guardImpact) return 'guard_impact';
  if (i.parrying) return 'parry';
  if (i.striking) return `strike_${i.striking}` as CombatWindow;
  if (i.windingUp) return 'windup';
  if (i.blocking) return 'block';
  if (i.celebrating) return 'celebrate';
  if (!i.engaged) return i.speed01 > COMBAT_MOVE_SPEED01 ? 'advance' : 'idle';
  if (i.speed01 > COMBAT_MOVE_SPEED01) {
    if (i.strafe !== 0) return 'strafe';
    return i.approach < 0 ? 'retreat' : 'advance';
  }
  return 'guard';
}
export function combatPose(i: CombatPostureInput): { window: CombatWindow; pose: PosturePose; legs: LegPose } {
  const window = combatWindow(i);
  return { window, pose: COMBAT_POSTURE[window], legs: COMBAT_LEGS[window] };
}

/** Seconds a react / parry / guard-impact beat owns the body (the modes latch the same windows on the tree). */
export const REACT_HOLD_SEC = 0.32, LAUNCH_HOLD_SEC = 1.0;
/** How far the eyes may lag a lock-on turn before the head is doing the work instead of the chest. */
export const COMBAT_TURN_RATE = 9.0;   // rad/s — a real pivot on the balls of the feet; an exchange still reads instant
/** A body this far past the foe's shoulder is circling, not closing. */
export const combatApproach = (closingSpeed: number): -1 | 0 | 1 => (closingSpeed > 0.4 ? 1 : closingSpeed < -0.4 ? -1 : 0);
/** Clamp helper re-exported so modes do not import DunkPosture for one function. */
export { clamp };
