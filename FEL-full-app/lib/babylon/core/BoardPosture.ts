// BoardPosture — the Posture Poses windows for the board family (BIOMECH-WAVE2, 2026-09-09): SkateRun and SurfBreak
// (Snowboard Slalom and Big Air ride the same table when their turn comes; nothing here is skate-specific).
//
// What was wrong (measured on 2942860, per rendered frame): boardSuite's clips key the hips, the legs and the arms and
// leave the thoracic chain alone, so a rider's chest sat where the last carve clip put it for the whole run, and the
// rider never looked anywhere — the head pointed down the ROOT's yaw, so on a surf drop the eyes were on the flat water
// in front of the nose instead of down the line, and in the barrel they were in the wall.
//
// The BANK is a smaller, more specific finding than "the rider never leaned" — he did. GroundRide already rolls the
// root toward `−steer · 0.28`, and the before run measures a 14.4° peak on both board modes. Two things were wrong with
// it: it is SPEED-BLIND (a fixed 16° cap whatever the board is doing), and it reads the RAW STICK while the carve CLIP
// is chosen from `move.balance.lean` — two independent signals for one move. On the wave that gap is the whole cutback:
// it is fired on B with the stick anywhere, so the board came round 90° with nothing leaning under it. Measured over
// the frames where a carve CLIP is actually playing, the body was upright (< 3° of roll) on 25/146 surf frames before
// and 7/145 after; on skate, where the stick and the balance lean already agree closely, it is 11/220 before and
// 11/212 after — no delta there, and this module does not claim one. What `boardBank` buys on both is that the roll is
// now the SAME signal the clip is, scaled by speed.
//
// Sport flavour (SPEC-FEL-BIOMECH-GAMEWIDE, "Football / freerun / boards — G1 = fall line / carve; G2 = carry or pump;
// G3 = air / trick budget"):
//   · G1 here is the FALL LINE: the chest squares to where the board is GOING (the travel), the eyes go to a look-ahead
//     point down the line — never to a fixed objective, because a board sport has none;
//   · a CARVE is a counter-rotation: the shoulders stay open down the line while the hips turn under them (chestAim
//     high, hipYawKeep low), and the ROOT banks (see `boardBank`);
//   · the AIR opens the chest and the eyes go to the landing, the GRAB folds the body around the board, the LAND
//     absorbs (chest down over the knees, heels DOWN — the same rule as the dunk's land crouch), and the BAIL hands
//     the body back to the clip (weight 0: nothing should stand a falling rider up).
import { clamp, type PosturePose } from './DunkPosture';
import type { LegPose } from './DunkLegs';

export type BoardWindow =
  | 'idle' | 'cruise' | 'push' | 'carve' | 'tuck'
  | 'air' | 'grab' | 'spin' | 'flip'
  | 'grind' | 'manual'
  | 'land' | 'bail'
  | 'barrel';   // surf only: inside the tube — chin down, chest open, eyes out the end

const P = (p: Omit<PosturePose, 'hipYawKeep'> & { hipYawKeep?: number }): PosturePose => ({ hipYawKeep: 1, ...p });

export const BOARD_POSTURE: Record<BoardWindow, PosturePose> = {
  idle:    P({ lean: 3,  spine1: [3, 0, 0],   spine2: [-4, 0, 0],  neck: [-2, 0, 0], head: [-6, 0, 0],  shrug: 0,  forward: 0,  eyes: 0.5, chestAim: 0.3, weight: 0.5 }),
  // rolling: knees soft, chest tall over the board, eyes up the line (the ride idle drops them onto the deck)
  cruise:  P({ lean: 7,  spine1: [6, 0, 0],   spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-10, 0, 0], shrug: 2,  forward: 0,  eyes: 0.9, chestAim: 0.6, weight: 0.7 }),
  // the push: the whole body folds over the pushing leg, the chest low and forward
  push:    P({ lean: 16, spine1: [12, 0, 0],  spine2: [-2, 0, 0],  neck: [-6, 0, 0], head: [-12, 0, 0], shrug: 2,  forward: 4,  eyes: 0.8, chestAim: 0.5, weight: 0.8 }),
  // THE CARVE: shoulders open DOWN THE LINE while the hips turn under them. hipYawKeep 0.55 lets the clip's own hip
  // swing read without dragging the chest round with it; the root banks separately (boardBank).
  carve:   P({ lean: 11, spine1: [9, 0, 0],   spine2: [-8, 0, 0],  neck: [-4, 0, 0], head: [-10, 0, 0], shrug: 4,  forward: -2, eyes: 1,   chestAim: 0.95, hipYawKeep: 0.55, weight: 0.9 }),
  // the tuck: folded small over the board, eyes still up
  tuck:    P({ lean: 24, spine1: [18, 0, 0],  spine2: [4, 0, 0],   neck: [-10, 0, 0], head: [-16, 0, 0], shrug: 6, forward: 10, eyes: 0.9, chestAim: 0.5, weight: 0.95 }),
  // air: the chest OPENS (a tucked-forward air reads as a fall), the eyes find the landing
  air:     P({ lean: -4, spine1: [-6, 0, 0],  spine2: [-10, 0, 0], neck: [-4, 0, 0], head: [-6, 0, 0],  shrug: 8,  forward: -4, eyes: 1,   chestAim: 0.5, hipYawKeep: 0.6, weight: 0.9 }),
  // the grab folds the body AROUND the board — chest down to the knee, head over it
  grab:    P({ lean: 20, spine1: [16, 0, 0],  spine2: [2, 0, 0],   neck: [-8, 0, 0], head: [-14, 0, 0], shrug: 10, forward: 8,  eyes: 0.8, chestAim: 0.3, hipYawKeep: 0.4, weight: 1 }),
  // a spin is owned by the mode's own yaw: the layer keeps the body tall and STAYS OUT of the aim (squaring the chest
  // to the travel mid-360 would cancel the rotation, the same rule the hoops spin window carries)
  spin:    P({ lean: 0,  spine1: [-4, 0, 0],  spine2: [-8, 0, 0],  neck: [-2, 0, 0], head: [-4, 0, 0],  shrug: 10, forward: -2, eyes: 0.5, chestAim: 0,   hipYawKeep: 0.5, weight: 0.85 }),
  flip:    P({ lean: 6,  spine1: [8, 0, 0],   spine2: [-2, 0, 0],  neck: [-4, 0, 0], head: [-8, 0, 0],  shrug: 8,  forward: 4,  eyes: 0.6, chestAim: 0,   hipYawKeep: 0.4, weight: 0.85 }),
  // the grind: the shoulders sit ACROSS the rail, the eyes down it
  grind:   P({ lean: 9,  spine1: [8, 0, 0],   spine2: [-6, 0, 0],  neck: [-4, 0, 0], head: [-10, 0, 0], shrug: 8,  forward: -2, eyes: 1,   chestAim: 0.7, hipYawKeep: 0.6, weight: 0.9 }),
  manual:  P({ lean: -8, spine1: [-6, 0, 0],  spine2: [-4, 0, 0],  neck: [-2, 0, 0], head: [-6, 0, 0],  shrug: 6,  forward: -6, eyes: 0.9, chestAim: 0.6, weight: 0.9 }),
  // the land ABSORBS: chest down over the loaded knees, heels on the deck — never a landing on the toes
  land:    P({ lean: 18, spine1: [14, 0, 0],  spine2: [2, 0, 0],   neck: [-4, 0, 0], head: [-10, 0, 0], shrug: 2,  forward: 8,  eyes: 0.7, chestAim: 0.5, weight: 0.95 }),
  // the bail belongs to the clip
  bail:    P({ lean: 0,  spine1: [0, 0, 0],   spine2: [0, 0, 0],   neck: [0, 0, 0],  head: [0, 0, 0],   shrug: 0,  forward: 0,  eyes: 0,   chestAim: 0,   weight: 0 }),
  // the barrel: crouched under the lip, chest OPEN to the face, eyes straight out the end of the tube
  barrel:  P({ lean: 20, spine1: [16, 0, 0],  spine2: [-6, 0, 0],  neck: [-8, 0, 0], head: [-14, 0, 0], shrug: 6,  forward: -4, eyes: 1,   chestAim: 0.8, weight: 1 }),
};

const L = (footPitch: number, weight: number, toeCurl = 0): LegPose => ({ footPitch, toeCurl, weight });
// The feet. On a board the "ground" is the deck and the deck is always under both soles — except in the air. The board
// clips key their own feet where it matters (the push's kick, the grab's tuck), so the layer only holds the SOLES FLAT
// where a held pose would otherwise leave the rider on his toes: the cruise, the carve, the grind and, hardest, the
// LAND (the same crouch-on-tiptoe the dunk pass found on every landing).
export const BOARD_LEGS: Record<BoardWindow, LegPose> = {
  idle: L(0, 0.5), cruise: L(0, 0.6), push: L(0, 0), carve: L(0, 0.7), tuck: L(0, 0.6),
  air: L(-18, 0.5), grab: L(0, 0), spin: L(-14, 0.4), flip: L(0, 0),
  grind: L(0, 0.8), manual: L(-10, 0.5),
  land: L(0, 1), bail: L(0, 0), barrel: L(0, 0.7),
};

// ── The window resolver ────────────────────────────────────────────────────
/** The same shape the BoardAnimTree is fed (plus the two surf reads), so a mode builds one object for both. */
export interface BoardPostureInput {
  speed01: number;
  pushing: boolean;
  /** −1..1, the mode's own balance lean / steer. */
  lean: number;
  airborne: boolean;
  grabHeld: boolean;
  flipping: boolean;
  spinning: boolean;
  grinding: boolean;
  manual: boolean;
  landing: boolean;
  bailing: boolean;
  tucking: boolean;
  /** Surf: under the lip with the tube open over you. */
  barrelled?: boolean;
}
export const BOARD_INPUT_IDLE: BoardPostureInput = {
  speed01: 0, pushing: false, lean: 0, airborne: false, grabHeld: false, flipping: false, spinning: false,
  grinding: false, manual: false, landing: false, bailing: false, tucking: false,
};

/** The lean past which the body is CARVING, matching boardTree's own CARVE_ON so the clip and the body agree. */
export const CARVE_LEAN = 0.4;

export function boardWindow(i: BoardPostureInput): BoardWindow {
  if (i.bailing) return 'bail';
  if (i.landing) return 'land';
  if (i.grinding) return 'grind';
  if (i.manual) return 'manual';
  if (i.airborne) return i.grabHeld ? 'grab' : i.flipping ? 'flip' : i.spinning ? 'spin' : 'air';
  if (i.barrelled) return 'barrel';
  if (i.pushing) return 'push';
  if (Math.abs(i.lean) > CARVE_LEAN && i.speed01 > 0.2) return 'carve';
  if (i.tucking) return 'tuck';
  return i.speed01 > 0.15 ? 'cruise' : 'idle';
}
export function boardPose(i: BoardPostureInput): { window: BoardWindow; pose: PosturePose; legs: LegPose } {
  const window = boardWindow(i);
  return { window, pose: BOARD_POSTURE[window], legs: BOARD_LEGS[window] };
}

// ── The bank (G6: the rider's mass goes inside the arc, not just the board's) ──
/** The most a rider's root rolls into a carve (rad). 22° is a hard park carve; a surfer buries the rail further, but
 *  past this the feet visibly leave the deck on the outside edge. */
export const BOARD_BANK_MAX = 22 * Math.PI / 180;
/** Roll (rad) for a lean at a speed: it is the LEAN that banks a rider, not the yaw rate — a slow pivot has no lean in
 *  it and a fast straight line has no roll. `lean` is the mode's own −1..1 (BoardMovement.balance.lean / the steer).
 *
 *  SIGN: the board stack's own convention, not a new one — BoardSync rolls the deck by `−lean · 0.22` and GroundRide
 *  rolls the root by `−steer · 0.28`, so a right lean is a NEGATIVE roll. Getting this backwards is not cosmetic: the
 *  first cut of this pass returned +lean and the two writers cancelled each other every frame (measured live, 21/198
 *  carve frames past 3° with a 5.8° peak — a rider standing straight up inside a full carve). */
export function boardBank(lean: number, speed01: number): number {
  return -clamp(lean, -1, 1) * clamp(speed01, 0, 1) * BOARD_BANK_MAX;
}
/** A point down the line for the eyes: `ahead` metres along the travel, at head height. Board sports have no objective,
 *  so this IS the G1 target — a rider looks where the board is taking him. */
export function lookAhead(pos: { x: number; y: number; z: number }, yaw: number, ahead = 6, eyeY = 1.5): { x: number; y: number; z: number } {
  return { x: pos.x + Math.sin(yaw) * ahead, y: pos.y + eyeY, z: pos.z + Math.cos(yaw) * ahead };
}
