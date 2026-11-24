// hoops-play (owner 2026-11-21, "Gameplay could still be improved greatly"): THE 1V1 RIVAL GOES AND GETS A LOOSE BALL.
//
// 3v3 has sent every AI body after a live board since ONEVONE/3V3 phase 3 ("EVERY AI BODY GOES FOR IT. Without this the brains held their
// seals and crash lanes while the ball rolled away", ThreeVThreeMode liveBoard → DefenderBrain.chaseBall). 1v1 never got the rule: on MY
// miss the rival held his box-out seal while the ball rolled away, and on HIS miss he crashed at a walk (3 m/s, after his follow-through)
// toward a ball running off at 5–7 m/s. Measured on the rig (docs/HOOPS-PLAY-AUDIT.md): 4 of 16 1v1 boards were still loose when the
// mode's 4 s stall guard gave up on them ("nobody came down with it") and teleported both bodies to the check; the median miss → board
// was 2.3 s (3v3, where the AI chases: 0.8 s, no stall in 9). With this on, 1v1 runs 3v3's rule: while a board is live and the rival is
// on his feet, his brain's chase (which outranks the seal) takes him to the ball, on my possession and on his. Off = as before exactly.
import { feel } from '../../feel-panel/feel';

/** 1 = the 1v1 rival chases a live board (3v3's rule); 0 = his seal / his crash as before. Knob `hoops.rivalChaseBoardOn`. */
export const RIVAL_CHASE_BOARD_ON = 1;
export const rivalChaseBoardOn = (): boolean => feel('hoops.rivalChaseBoardOn', RIVAL_CHASE_BOARD_ON) >= 0.5;

interface Planar { x: number; z: number }
/** Where the rival's chase points this frame: the ball while a board is live and he can go (not floored, not stunned), else null (no chase:
 *  the brain's own job). Null whenever the knob is off. */
export function rivalChaseTarget<T extends Planar>(boardLive: boolean, able: boolean, ball: T): T | null {
  return rivalChaseBoardOn() && boardLive && able ? ball : null;
}

// ── lane/improve-hoops-2 phase 4b (docs/IMPROVE-10-PHASE-AUDIT.md, 2026-11-22): THE CHASE GOES ROUND A BODY IN HIS LINE ─────────────
// HOOPS-PLAY-AUDIT §5.2's one stall left (seed 47): the rival was chasing, but a body stood between him and the ball at the body standoff
// (1.10 m) for the whole 4 s guard — the chase runs a straight line and never goes round. With this on, a chase that has made no ground
// for CHASE_STALL_SEC with a body across his line steps round it: a waypoint off that body's shoulder (the side he is already on), held
// until he reaches it, passes the body, or CHASE_DETOUR_SEC runs out; then the ball again. Off (0) = the straight chase, as before.
/** 1 = the rival's board chase steps round a body that blocks it; 0 = the straight line, as before (shipped 0: its bar was not met). Knob `hoops.rivalChaseAroundBody`. */
export const RIVAL_CHASE_AROUND_BODY = 0;
export const rivalChaseAroundBody = (): boolean => feel('hoops.rivalChaseAroundBody', RIVAL_CHASE_AROUND_BODY) >= 0.5;
/** How long a chase may make no ground before it steps round (s). The plan's number (the audit's stall: 4 s at the standoff). */
export const CHASE_STALL_SEC = 0.5;
/** "Ground": closing on the ball by at least this much since the best distance so far (m). */
export const CHASE_PROGRESS_M = 0.15;
/** A body blocks the chase when it is this close to the line from the rival to the ball (m), and this close to the rival. */
export const CHASE_BLOCK_LINE_M = 1.3;
export const CHASE_BLOCK_NEAR_M = 1.8;
/** The waypoint: this far off the blocking body's centre, square to the line (m: past the 1.10 m standoff), and a little past it. */
export const CHASE_SIDESTEP_M = 1.6;
export const CHASE_PAST_M = 0.4;
/** The longest a detour is held (s). */
export const CHASE_DETOUR_SEC = 1.0;

/** The pure geometry: where a blocked chase steps to, or null when the body is not across the line. */
export function detourPoint(self: Planar, ball: Planar, body: Planar): Planar | null {
  const dx = ball.x - self.x, dz = ball.z - self.z, L = Math.hypot(dx, dz);
  if (L < 1e-3) return null;
  const ux = dx / L, uz = dz / L;
  const bx = body.x - self.x, bz = body.z - self.z;
  const along = bx * ux + bz * uz;
  if (along <= 0 || along >= L) return null;   // behind him, or past the ball
  const lateral = bx * -uz + bz * ux;   // + = the body is to his left of the line
  if (Math.abs(lateral) > CHASE_BLOCK_LINE_M || Math.hypot(bx, bz) > CHASE_BLOCK_NEAR_M) return null;
  const side = lateral > 0 ? -1 : 1;   // go round on the side he is already on (the body's other side from him)
  return { x: body.x + -uz * side * CHASE_SIDESTEP_M + ux * CHASE_PAST_M, z: body.z + ux * side * CHASE_SIDESTEP_M + uz * CHASE_PAST_M };
}

/** One board's chase-round state. `next` each frame of a live chase: a waypoint to chase instead of the ball, or null (the ball). */
export class ChaseAround {
  private best = Infinity;
  private stall = 0;
  private detour: Planar | null = null;
  private detourLeft = 0;
  private lastAge = -1;
  /** Detours taken this page (the probe counts them). */
  count = 0;
  reset(): void { this.best = Infinity; this.stall = 0; this.detour = null; this.detourLeft = 0; }
  next(dt: number, boardAge: number, chasing: boolean, self: Planar, ball: Planar, body: Planar): Planar | null {
    if (boardAge < this.lastAge) this.reset();   // a new board
    this.lastAge = boardAge;
    if (!chasing || !rivalChaseAroundBody()) { this.reset(); return null; }
    const d = Math.hypot(ball.x - self.x, ball.z - self.z);
    if (this.detour) {
      this.detourLeft -= dt;
      const reached = Math.hypot(this.detour.x - self.x, this.detour.z - self.z) < 0.45;
      if (this.detourLeft <= 0 || reached || !detourPoint(self, ball, body)) { this.detour = null; this.best = d; this.stall = 0; }
      else return this.detour;
    }
    if (d < this.best - CHASE_PROGRESS_M) { this.best = d; this.stall = 0; } else this.stall += dt;
    if (this.stall >= CHASE_STALL_SEC) {
      const w = detourPoint(self, ball, body);
      this.stall = 0; this.best = d;
      if (w) { this.detour = w; this.detourLeft = CHASE_DETOUR_SEC; this.count++; return w; }
    }
    return null;
  }
}
