// threevthreeMate — MY TEAMMATE WITH THE BALL READS AND PLAYS (lane/h3-aware, owner decision 2026-10-24: port PR #315's H3e).
//
// On release my teammate with my pass had one way to score: `Vector3.Distance(root, RIM) < 3.5 && Math.random() < 0.01` per frame.
// RIM is the ring at 3.05 m, so that 3D distance only drops under 3.5 m inside ~1.7 m of the rim on the floor: he almost never shot,
// and never moved the ball on unless I called for it — he dribbled on the spot while the possession stood still (#315: every
// after-catch take of its probe still dribbling at the end of the 4 s window). Now he READS, every frame once he has caught it:
//   a beat to catch it (MATE_SETTLE_SEC) → the shot off the catch when he is open in range (the rival's own SHOOT_OPEN_M) → a drive when
//   his lane to the rim is clear (finished at MATE_FINISH_M, or after MATE_DRIVE_MAX_SEC) → the swing to the open man (me first) after
//   MATE_READ_SEC → and never the ball held past MATE_HOLD_MAX_SEC (in range a contested look, else the swing).
// Only the CHOICE is his. The shot is the mode's teammateShoots — its make chance is RimForAll.matePct on the ring (RimDecides, #391),
// the same function and the same inputs as before; nothing here rolls a die or touches a percentage.
// Pure; every number is a feel knob (group "Hoops · teammate"). MATE_READ_ON 0 = release's roll exactly.
import { feel } from '../../feel-panel/feel';
import { SHOOT_OPEN_M, KICK_OPEN_M, laneClear, openness, type XZ } from './threevthreeRules';

/** The read on (1) / off (0). Off: release's 1 %-a-frame roll inside 3.5 m of the ring, exactly. TUNED (new). */
export const MATE_READ_ON = 1;
/** A beat to catch it before any read (s). TUNED (new; #315). */
export const MATE_SETTLE_SEC = 0.35;
/** From the catch, how long before he swings it to an open man (s). TUNED (new; #315). */
export const MATE_READ_SEC = 0.9;
/** The most he holds it (s): then a shot in range, else the swing. TUNED (new; #315). */
export const MATE_HOLD_MAX_SEC = 1.8;
/** He shoots off the catch inside this (m, flat to the rim). TUNED (new; #315). */
export const MATE_SHOOT_RANGE_M = 7.3;
/** He drives a clear lane from inside this (m). TUNED (new; #315). */
export const MATE_DRIVE_FROM_M = 8.5;
/** A drive finishes (the shot) inside this (m). TUNED (new; #315). */
export const MATE_FINISH_M = 2.4;
/** …or after this long on the drive (s). TUNED (new; #315). */
export const MATE_DRIVE_MAX_SEC = 1.6;
/** His lane to the rim is clear with nobody of theirs inside this of the line (m, laneClear's half-width). TUNED (new; #315). */
export const MATE_LANE_M = 0.9;
/** Release's roll, kept for the A/B: inside this 3D distance to the ring (m)… */
export const RELEASE_ROLL_RIM_M = 3.5;
/** …this chance a frame. */
export const RELEASE_ROLL_PER_FRAME = 0.01;

export const mateReadOn = (): boolean => feel('hoops.mateReadOn', MATE_READ_ON) >= 0.5;

export type MateCall = 'hold' | 'shoot' | 'drive' | 'pass';
export interface MateRead {
  /** Since he caught it (s). */ sinceCatchSec: number;
  /** His floor distance to the rim (m). */ rimDist: number;
  /** His openness: the nearest defender (m). */ open: number;
  /** Nobody of theirs on his line to the rim (laneClear at MATE_LANE_M). */ laneToRim: boolean;
  /** He is on a drive he started, and for how long (s). */ driving: boolean; driveSec: number;
  /** A man of ours is open with a clear lane (the swing's target exists). */ passOpen: boolean;
}

/** The read itself. */
export function mateCall(r: MateRead): MateCall {
  const range = feel('hoops.mateShootRangeM', MATE_SHOOT_RANGE_M);
  if (r.sinceCatchSec < feel('hoops.mateSettleSec', MATE_SETTLE_SEC)) return 'hold';
  if (r.driving) return r.rimDist <= feel('hoops.mateFinishM', MATE_FINISH_M) || r.driveSec >= feel('hoops.mateDriveMaxSec', MATE_DRIVE_MAX_SEC) ? 'shoot' : 'drive';
  if (r.open >= SHOOT_OPEN_M && r.rimDist <= range) return 'shoot';
  if (r.laneToRim && r.rimDist <= feel('hoops.mateDriveFromM', MATE_DRIVE_FROM_M)) return 'drive';
  if (r.sinceCatchSec >= feel('hoops.mateReadSec', MATE_READ_SEC) && r.passOpen) return 'pass';
  if (r.sinceCatchSec >= feel('hoops.mateHoldMaxSec', MATE_HOLD_MAX_SEC)) return r.rimDist <= range ? 'shoot' : 'pass';
  return 'hold';
}

/** Is `who` open for his swing: KICK_OPEN_M from their nearest man and a clear lane from the passer (the rival's kick read). */
export function swingOpen(passer: XZ, who: XZ, defenders: readonly XZ[]): boolean {
  return openness(who, defenders) >= KICK_OPEN_M && laneClear(passer, who, defenders);
}

export interface MateFrame {
  self: XZ; rim: XZ; me: XZ; other: XZ | null; defenders: readonly XZ[];
}
export interface MateTurn {
  call: MateCall;
  /** The swing's man (a 'pass'): me when I am open or he is not (the ball comes back to the player first — #315's assumption). */
  to: 'me' | 'other';
  /** A 'drive': the unit floor direction to the rim. */
  dirX: number; dirZ: number;
  /** For the log: since the catch, and whether he was on a drive. */
  sinceCatchSec: number; offDrive: boolean;
}

/** One teammate's clock with the ball: since the catch, his drive. The mode keeps one per teammate and calls `step` while he holds it,
 *  `drop` the frame he does not. */
export class MateBall {
  private since = 0; private driving = false; private driveSec = 0; private holding = false;
  step(dt: number, f: MateFrame): MateTurn {
    if (!this.holding) { this.holding = true; this.since = 0; this.driving = false; this.driveSec = 0; }
    this.since += Math.max(0, dt); if (this.driving) this.driveSec += Math.max(0, dt);
    const rimDist = Math.hypot(f.self.x - f.rim.x, f.self.z - f.rim.z);
    const meOpen = swingOpen(f.self, f.me, f.defenders);
    const otherOpen = !!f.other && swingOpen(f.self, f.other, f.defenders);
    const call = mateCall({
      sinceCatchSec: this.since, rimDist, open: openness(f.self, f.defenders),
      laneToRim: laneClear(f.self, f.rim, f.defenders, feel('hoops.mateLaneM', MATE_LANE_M)),
      driving: this.driving, driveSec: this.driveSec, passOpen: meOpen || otherOpen,
    });
    const offDrive = this.driving;
    if (call === 'drive') this.driving = true;
    if (call === 'shoot' || call === 'pass') this.holding = false;   // the ball leaves him: the next catch starts a new read
    const dl = rimDist > 1e-3 ? rimDist : 1;
    return { call, to: meOpen || !otherOpen ? 'me' : 'other', dirX: (f.rim.x - f.self.x) / dl, dirZ: (f.rim.z - f.self.z) / dl, sinceCatchSec: this.since, offDrive };
  }
  /** He is on a drive he started (the tree's `driving`). */
  get onDrive(): boolean { return this.holding && this.driving; }
  /** He does not have it this frame. */
  drop(): void { this.holding = false; this.driving = false; }
}
