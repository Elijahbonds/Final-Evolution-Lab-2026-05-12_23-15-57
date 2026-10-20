// hoopsFlow — the 1v1 / 3v3 glue for hoops round 2's handle items (owner 2026-10-20), so each mode carries one-line hooks and the logic
// lives here and in the pure modules it drives:
//   - PlayerGuardHand: THE OUTSIDE HAND WHEN GUARDED (core/GuardHand) — stepped each frame on my carry, it runs the quiet crossing;
//   - the COMBO WINDOW's flow (anim/comboFlow) — one ComboFlow per mode on my HandleHost; comboBanner shows what it says;
//   - the LEFT-HAND SPIN (anim/leftMoveTwins) — re-exported for the spawn and startSpin hooks.
import type { BallCarry } from '../anim/ballCarry';
import { sideAwayFrom } from '../anim/athleteSide';
import { stepGuardHand, GUARD_HAND_IDLE, type GuardHandState } from '../core/GuardHand';
import { ComboFlow } from '../anim/comboFlow';

export { ComboFlow } from '../anim/comboFlow';
export { leftMoveTwins, spinClipFor } from '../anim/leftMoveTwins';

interface Planar { x: number; z: number }
type GuardCarry = Pick<BallCarry, 'hand' | 'move' | 'runMove'>;

/** My ball hand against the man guarding me (core/GuardHand): one per mode, stepped once a frame after the carry's update. */
export class PlayerGuardHand {
  private st: GuardHandState = GUARD_HAND_IDLE;
  /** Crossings it has run (logged; the rig counts them). */
  crosses = 0;
  /**
   * One frame. `defender`: the nearest LIVE defender's position (not stunned, not floored), or null. `dribbling`: my live dribble (the
   * mode's own read — the one H2d's strong-hand return used). Returns true when it crossed the ball over this frame.
   */
  step(dt: number, carry: GuardCarry | null | undefined, me: { position: Planar; rotation: { y: number } }, defender: Planar | null, dribbling: boolean, tag: string): boolean {
    if (!carry) { this.st = GUARD_HAND_IDLE; return false; }
    const d = defender ? { dist: Math.hypot(defender.x - me.position.x, defender.z - me.position.z), away: sideAwayFrom(me.position, me.rotation.y, defender) } : null;
    const s = stepGuardHand(this.st, dt, { hand: carry.hand === 'Left' ? 'left' : 'right', defender: d, dribbling, moveActive: !!carry.move });
    this.st = s.state;
    if (!s.cross || !carry.runMove('crossover', { pace: 1 })) return false;
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
