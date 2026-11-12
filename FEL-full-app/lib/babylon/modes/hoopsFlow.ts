// hoopsFlow — the 1v1 / 3v3 glue for hoops round 2's handle items (owner 2026-10-20), so each mode carries one-line hooks and the logic
// lives here and in the pure modules it drives:
//   - PlayerGuardHand: THE OUTSIDE HAND WHEN GUARDED (core/GuardHand) — stepped each frame on my carry, it runs the quiet crossing;
//   - the COMBO WINDOW's flow (anim/comboFlow) — one ComboFlow per mode on my HandleHost; comboBanner shows what it says;
//   - the LEFT-HAND SPIN (anim/leftMoveTwins) — re-exported for the spawn and startSpin hooks.
import { HAND_CHANGE_CATCH_LEAD_SEC, type BallCarry } from '../anim/ballCarry';
import { CONTACT_FADE_SEC } from '../anim/handlePaths';
import { feel } from '../../feel-panel/feel';
import { sideAwayFrom } from '../anim/athleteSide';
import { stepGuardHand, GUARD_HAND_IDLE, type GuardHandState } from '../core/GuardHand';
import { ComboFlow } from '../anim/comboFlow';

export { ComboFlow } from '../anim/comboFlow';
export { leftMoveTwins, spinClipFor } from '../anim/leftMoveTwins';

interface Planar { x: number; z: number }
type GuardCarry = Pick<BallCarry, 'hand' | 'move' | 'runMove'>;

/** hoops-p06 (the play audit, HOOPS-AAA-GAP-PLAY sinker 1: guarded at rest the auto hand crossed about once a second, and every crossing
 *  is a hand change — 14 of 21 hard pops in a 22 s 1v1 run). Standing (planar speed under GUARD_REST_MPS), the outside hand crosses at
 *  most once every this many seconds; on the move it is the rule as before. Knob `hoops.guardHandRestGapSec`; 0 = as before exactly. */
export const GUARD_HAND_REST_GAP_SEC = 1.5;
/** Under this planar speed (m/s) the player is at rest for the gap above (the 3v3 drive read's "set": 0.6). */
export const GUARD_REST_MPS = 0.6;

/** My ball hand against the man guarding me (core/GuardHand): one per mode, stepped once a frame after the carry's update. */
export class PlayerGuardHand {
  private st: GuardHandState = GUARD_HAND_IDLE;
  /** Crossings it has run (logged; the rig counts them). */
  crosses = 0;
  /** hoops-p06: seconds since this rule last crossed, and where I was last frame (my speed, for the rest gap). */
  private sinceCross = Infinity; private last: Planar | null = null;
  /**
   * One frame. `defender`: the nearest LIVE defender's position (not stunned, not floored), or null. `dribbling`: my live dribble (the
   * mode's own read — the one H2d's strong-hand return used). Returns true when it crossed the ball over this frame.
   */
  step(dt: number, carry: GuardCarry | null | undefined, me: { position: Planar; rotation: { y: number } }, defender: Planar | null, dribbling: boolean, tag: string): boolean {
    const speed = this.last && dt > 1e-6 ? Math.hypot(me.position.x - this.last.x, me.position.z - this.last.z) / dt : 0;
    this.last = { x: me.position.x, z: me.position.z }; this.sinceCross += dt;
    if (!carry) { this.st = GUARD_HAND_IDLE; return false; }
    const d = defender ? { dist: Math.hypot(defender.x - me.position.x, defender.z - me.position.z), away: sideAwayFrom(me.position, me.rotation.y, defender) } : null;
    const prev = this.st;
    const s = stepGuardHand(this.st, dt, { hand: carry.hand === 'Left' ? 'left' : 'right', defender: d, dribbling, moveActive: !!carry.move });
    this.st = s.state;
    if (!s.cross) return false;
    // hoops-p06: at rest, not again inside the rest gap — the rule keeps counting, and crosses the frame the gap is out
    const gap = feel('hoops.guardHandRestGapSec', GUARD_HAND_REST_GAP_SEC);
    if (gap > 0 && speed < GUARD_REST_MPS && this.sinceCross < gap) { this.st = { wrongSec: prev.wrongSec + dt, sinceSec: prev.sinceSec + dt }; return false; }
    // hoops-p06: the catching hand comes to meet the ball (anim/ballCarry HAND_CHANGE_CATCH_LEAD_SEC; the schedule's own at 0.06)
    const lead = feel('hoops.handChangeCatchLeadSec', HAND_CHANGE_CATCH_LEAD_SEC);
    if (!carry.runMove('crossover', lead > CONTACT_FADE_SEC ? { pace: 1, catchLeadSec: lead } : { pace: 1 })) return false;
    this.sinceCross = 0;
    this.crosses++;
    console.info(`[${tag}-HANDLE] guard hand crosses → ${carry.hand} (him ${d ? d.dist.toFixed(1) : '-'} m) #${this.crosses}`);
    return true;
  }
}

/** The combo flow's label, once, for the mode's banner (null: nothing to show). */
export function comboBanner(flow: ComboFlow, show: (text: string, ms: number) => void, tag: string): void {
  const l = flow.takeLabel(); if (!l) return;
  show(l, 750);
  console.info(`[${tag}-HANDLE] combo flow ${l} (count ${flow.state.count})`);
}
