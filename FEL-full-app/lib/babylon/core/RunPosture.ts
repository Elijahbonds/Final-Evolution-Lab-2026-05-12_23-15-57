// RunPosture — the Posture Poses windows for the running family (BIOMECH-WAVE2, 2026-09-09): Football Rush and FreeRun.
// One table, two resolvers: a ball carrier and a traceur are the same body doing the same job — run a line, spend the
// speed on a move, land in a shape you can run out of.
//
// What was wrong (measured on 2942860, per rendered frame):
//   · FOOTBALL had no animation owner at all — the mode called `runner.animator.play(footballCarryRun, { loop: true })`
//     from inside update() every frame, and separately played the juke / the truck / the tackle / the TOUCHDOWN
//     celebrate. `CharacterAnimator.play` only dedupes the SAME clip, so the per-frame carry-run cut every one-shot the
//     frame after it started: the touchdown celebrate never played (the drive resets on the same frame anyway), and a
//     `FootballAnimTree` had been written, unit-tested and never wired into the mode. There is no ball in this mode, so
//     the carry arm is the clip's — but the clip was `football_sprint_return`, a free-arm sprint, under a mode whose
//     whole verb set is carrying.
//   · FREERUN wrote the stick's heading straight onto the root (`root.rotation.y = atan2(heading)`, and on the ground
//     `heading` IS the stick), so a flicked stick turned the body in ONE frame; and the landing wrote
//     `root.rotation.x = 0; root.rotation.z = 0` on the touchdown frame, teleporting away the last quarter of every
//     somersault.
//   · Neither mode touched the thoracic chain or the head: a runner reading a front never LOOKED at the defender in
//     front of him, and a traceur never looked at the ledge he was about to catch.
//
// Sport flavour: G1 is the LINE — the chest squares to the travel, the eyes go to the nearest threat when there is one
// (football's next defender) and otherwise down the line. A cut / juke leaves the chest on the line while the hips go
// (that is what sells a juke). A vault and a wallrun put the eyes on the surface. Every landing absorbs, heels down.
import { clamp, type PosturePose } from './DunkPosture';
import type { LegPose } from './DunkLegs';

export type RunWindow =
  | 'idle' | 'set' | 'jog' | 'run' | 'sprint' | 'carry'
  | 'juke' | 'spin' | 'hurdle' | 'truck'
  | 'vault' | 'wallrun' | 'slide'
  | 'air' | 'trick' | 'land'
  | 'tackled' | 'down' | 'rise' | 'celebrate';

const P = (p: Omit<PosturePose, 'hipYawKeep'> & { hipYawKeep?: number }): PosturePose => ({ hipYawKeep: 1, ...p });

export const RUN_POSTURE: Record<RunWindow, PosturePose> = {
  idle:      P({ lean: 2,  spine1: [2, 0, 0],   spine2: [-4, 0, 0],  neck: [-2, 0, 0], head: [-6, 0, 0],  shrug: 0,  forward: 0,  eyes: 0.6, chestAim: 0.3, weight: 0.6 }),
  // SET at the line: low, coiled, head UP reading the front — the one window where the eyes matter more than the chest
  set:       P({ lean: 14, spine1: [12, 0, 0],  spine2: [-6, 0, 0],  neck: [-10, 0, 0], head: [-16, 0, 0], shrug: 4, forward: 4,  eyes: 1,   chestAim: 0.5, weight: 0.9 }),
  jog:       P({ lean: 6,  spine1: [5, 0, 0],   spine2: [-4, 0, 0],  neck: [-3, 0, 0], head: [-8, 0, 0],  shrug: 0,  forward: 2,  eyes: 0.7, chestAim: 0.5, weight: 0.6 }),
  run:       P({ lean: 10, spine1: [8, 0, 0],   spine2: [-5, 0, 0],  neck: [-4, 0, 0], head: [-10, 0, 0], shrug: 2,  forward: 2,  eyes: 0.9, chestAim: 0.7, weight: 0.75 }),
  // full stride: the lumbar leads, the thoracic stays OPEN (a rounded chest at speed reads as a jog on a treadmill)
  sprint:    P({ lean: 15, spine1: [11, 0, 0],  spine2: [-8, 0, 0],  neck: [-6, 0, 0], head: [-12, 0, 0], shrug: 4,  forward: 0,  eyes: 1,   chestAim: 0.8, weight: 0.85 }),
  // carrying: one shoulder rolls forward over the ball, the chest still down the line
  carry:     P({ lean: 13, spine1: [10, 0, 0],  spine2: [-4, 0, 0],  neck: [-5, 0, 0], head: [-10, 0, 0], shrug: 5,  forward: 6,  eyes: 1,   chestAim: 0.8, weight: 0.85 }),
  // the JUKE: the hips go, the chest STAYS on the line (chestAim high, hipYawKeep low) — that mismatch IS the sell
  juke:      P({ lean: 12, spine1: [10, 0, 0],  spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-10, 0, 0], shrug: 6,  forward: 4,  eyes: 1,   chestAim: 0.9, hipYawKeep: 0.45, weight: 0.9 }),
  // the SPIN turns through: the mode's own yaw owns it, the layer stays out of the aim
  spin:      P({ lean: 8,  spine1: [7, 0, 0],   spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 6,  forward: 2,  eyes: 0.5, chestAim: 0,   hipYawKeep: 0.5, weight: 0.8 }),
  hurdle:    P({ lean: 4,  spine1: [6, 0, 0],   spine2: [-8, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 8,  forward: -2, eyes: 1,   chestAim: 0.7, weight: 0.9 }),
  // TRUCK: the shoulder LOWERS into the contact and the chin comes down behind it
  truck:     P({ lean: 22, spine1: [18, 0, 0],  spine2: [4, 0, 0],   neck: [4, 0, 0],  head: [2, 0, 0],   shrug: 10, forward: 12, eyes: 0.6, chestAim: 0.9, weight: 1 }),
  // vault: the chest folds over the hands on the obstacle, the eyes are already past it
  vault:     P({ lean: 26, spine1: [20, 0, 0],  spine2: [2, 0, 0],   neck: [-8, 0, 0], head: [-14, 0, 0], shrug: 12, forward: 8,  eyes: 1,   chestAim: 0.6, weight: 0.95 }),
  // wallrun: the body ROLLS toward the wall and the eyes run along it
  wallrun:   P({ lean: 8,  spine1: [6, 0, 0],   spine2: [-10, 0, 0], neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 10, forward: -4, eyes: 1,   chestAim: 0.5, hipYawKeep: 0.7, weight: 0.9 }),
  slide:     P({ lean: -10, spine1: [-8, 0, 0], spine2: [-6, 0, 0],  neck: [4, 0, 0],  head: [6, 0, 0],   shrug: 4,  forward: -2, eyes: 0.8, chestAim: 0.6, weight: 0.9 }),
  air:       P({ lean: -2, spine1: [-4, 0, 0],  spine2: [-10, 0, 0], neck: [-4, 0, 0], head: [-6, 0, 0],  shrug: 8,  forward: -4, eyes: 1,   chestAim: 0.5, hipYawKeep: 0.6, weight: 0.9 }),
  // a trick is a rotation the mode owns: tall, tucked, the layer out of the aim
  trick:     P({ lean: 10, spine1: [10, 0, 0],  spine2: [0, 0, 0],   neck: [-6, 0, 0], head: [-10, 0, 0], shrug: 8,  forward: 6,  eyes: 0.4, chestAim: 0,   hipYawKeep: 0.35, weight: 0.9 }),
  // the land absorbs — heels down, chest over the knees (the dunk's land rule)
  land:      P({ lean: 18, spine1: [14, 0, 0],  spine2: [2, 0, 0],   neck: [-4, 0, 0], head: [-10, 0, 0], shrug: 2,  forward: 8,  eyes: 0.8, chestAim: 0.6, weight: 0.95 }),
  // the floor family: the clip owns the body
  tackled:   P({ lean: 0,  spine1: [0, 0, 0],   spine2: [0, 0, 0],   neck: [0, 0, 0],  head: [0, 0, 0],   shrug: 0,  forward: 0,  eyes: 0,   chestAim: 0,   weight: 0 }),
  down:      P({ lean: 0,  spine1: [0, 0, 0],   spine2: [0, 0, 0],   neck: [0, 0, 0],  head: [0, 0, 0],   shrug: 0,  forward: 0,  eyes: 0,   chestAim: 0,   weight: 0 }),
  rise:      P({ lean: 14, spine1: [10, 0, 0],  spine2: [-2, 0, 0],  neck: [-6, 0, 0], head: [-10, 0, 0], shrug: 4,  forward: 4,  eyes: 0.8, chestAim: 0.4, weight: 0.5 }),
  celebrate: P({ lean: -6, spine1: [-8, 0, 0],  spine2: [-12, 0, 0], neck: [-6, 0, 0], head: [-6, 0, 0],  shrug: 8,  forward: -8, eyes: 0.3, chestAim: 0.3, weight: 0.9 }),
};

const L = (footPitch: number, weight: number, toeCurl = 0): LegPose => ({ footPitch, toeCurl, weight });
// The run loops key their own feet (heel-strike / toe-off): the layer stays OUT of them (weight 0). It only owns the
// feet where a pose clip left them and where a wrong foot is the whole tell — the set, the air, the land.
export const RUN_LEGS: Record<RunWindow, LegPose> = {
  idle: L(0, 0.5), set: L(0, 0.7), jog: L(0, 0), run: L(0, 0), sprint: L(0, 0), carry: L(0, 0),
  juke: L(0, 0), spin: L(0, 0), hurdle: L(-25, 0.7), truck: L(0, 0),
  vault: L(-20, 0.6), wallrun: L(-10, 0.4), slide: L(10, 0.7),
  air: L(-30, 0.8), trick: L(-35, 0.7), land: L(0, 1),
  tackled: L(0, 0), down: L(0, 0), rise: L(0, 0.3), celebrate: L(0, 0.6),
};

// ── The football resolver ──────────────────────────────────────────────────
export interface FootballPostureInput {
  presnap: boolean;
  speed01: number;
  /** 'juke' | 'spin' | 'hurdle' — the one-shot in flight. */
  move: 'juke' | 'spin' | 'hurdle' | null;
  trucking: boolean;
  downed: boolean;
  celebrating: boolean;
}
export const FOOTBALL_INPUT_IDLE: FootballPostureInput = { presnap: true, speed01: 0, move: null, trucking: false, downed: false, celebrating: false };
export function footballWindow(i: FootballPostureInput): RunWindow {
  if (i.downed) return 'tackled';
  if (i.celebrating) return 'celebrate';
  if (i.presnap) return 'set';
  if (i.move) return i.move;
  if (i.trucking) return 'truck';
  return i.speed01 > 0.15 ? 'carry' : 'idle';
}

// ── The freerun resolver ───────────────────────────────────────────────────
export interface FreeRunPostureInput {
  /** The mode's own RunState. */
  state: 'ground' | 'air' | 'wallrun' | 'slide' | 'down';
  speed01: number;
  tricking: boolean;
  /** Inside the landing beat. */
  landing: boolean;
  /** The last part of DOWN_SEC is the get-up. */
  rising: boolean;
  vaulting: boolean;
  celebrating: boolean;
}
export const FREERUN_INPUT_IDLE: FreeRunPostureInput = { state: 'ground', speed01: 0, tricking: false, landing: false, rising: false, vaulting: false, celebrating: false };
export function freeRunWindow(i: FreeRunPostureInput): RunWindow {
  if (i.state === 'down') return i.rising ? 'rise' : 'down';
  if (i.celebrating) return 'celebrate';
  if (i.state === 'wallrun') return 'wallrun';
  if (i.state === 'slide') return 'slide';
  if (i.state === 'air') return i.tricking ? 'trick' : 'air';
  if (i.landing) return 'land';
  if (i.vaulting) return 'vault';
  if (i.speed01 > 0.7) return 'sprint';
  if (i.speed01 > 0.3) return 'run';
  return i.speed01 > 0.1 ? 'jog' : 'idle';
}

export function runPose(window: RunWindow): { window: RunWindow; pose: PosturePose; legs: LegPose } {
  return { window, pose: RUN_POSTURE[window], legs: RUN_LEGS[window] };
}

/** How fast a runner may turn onto a new line (rad/s). A cut is a real plant — the football mode's own TURN_RATE is
 *  6.5; a traceur on foot turns faster than a ball carrier under load, but never in one frame. */
export const RUNNER_TURN_RATE = 8.0;
/** The roll a runner banks into a hard cut (rad). Smaller than a board's: a runner's edge is a foot, not a rail. */
export const RUN_BANK_MAX = 12 * Math.PI / 180;
export const runBank = (yawRatePerSec: number, speed01: number): number =>
  clamp(yawRatePerSec * 0.10 * clamp(speed01, 0, 1), -RUN_BANK_MAX, RUN_BANK_MAX);
