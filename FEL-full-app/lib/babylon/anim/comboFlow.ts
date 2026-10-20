// comboFlow — THE COMBO WINDOW (hoops round 2, owner 2026-10-20: "Combos: chain with a combo window. A move pressed in the last part of
// the previous one flows straight into it with no reset. Three in a row reads as a combo on screen. This is flow only: no odds change.").
//
// What it is, and what it is NOT:
//   - FLOW. A move pressed while another runs already queued behind it and started at the running move's catch (handleMotion.requestMove,
//     the carry's queueMove). The one move whose catch was a RESET is the hesitation: its path floats the ball, pounds it forward, and
//     catches it back at the top of the same hand — so a cross thrown out of a hesi waited for that whole pound and catch (0.56 s of the
//     hesi's 0.66 s at pace 1) before it crossed. A path with a FLOAT then a POUND (the hesi; handlePaths.cutInWindow) now hands the ball on at
//     the float's top: a move pressed before the pound has finished starts there, from the ball as it is. Thrown off a hesi, the cross
//     is the HESI CROSS — one fluid move (the float, then the cross on the pound), not a hesi, a catch and a crossover.
//   - THE COUNT. A move pressed in the last part of the running one (k ≥ COMBO_OPEN_K), or cut in at the hesi's float, or pressed within
//     COMBO_GRACE_SEC of the last one ending, FLOWS: the count goes up. Anything else starts a new count at 1. At COMBO_SHOW_AT and above
//     the mode shows it ("3-MOVE COMBO").
//   - NOT THE ODDS. HandleSystem's chain (canChain / pushChain / chainWindowSec / ankleBreakOdds) is untouched and still decides every
//     roll, link and tier exactly as before; this count reads nothing it writes and is read by nothing that rolls.
//
// Pure (no scene): the state machine and the window are unit-tested; handleMotion.requestMove drives it through the HandleHost's `flow`.
export { cutInWindow } from './handlePaths';   // (the window lives with the paths: the carry — and so the dunk's import closure — reads it)

/** The last part of a running move: a press at or past this share of it flows (new — a feel number: register as `hoops.comboOpenK`). */
export const COMBO_OPEN_K = 0.5;
/** A press this soon after the last move ended still flows (s; new — `hoops.comboGraceSec`): the dribble has not settled yet. */
export const COMBO_GRACE_SEC = 0.15;
/** The count at which a combo reads on screen (the owner's "three in a row"). */
export const COMBO_SHOW_AT = 3;

export interface ComboState {
  /** Moves flowed together so far (1 = a move on its own). */
  count: number;
  /** When the last move ended (s, the flow's clock), or -Infinity. */
  endedAt: number;
  /** The last move pressed, and whether it was a hesitation (the hesi cross reads it). */
  last: string | null;
}
export const COMBO_IDLE: ComboState = { count: 0, endedAt: -Infinity, last: null };

export interface ComboPress {
  /** The move pressed (a HandleMove, or 'jab'). */
  move: string;
  /** The running move's k (0..1) when it was pressed, or null: none was running. */
  runningK: number | null;
  /** The running move's name, or null. */
  runningName: string | null;
  /** The press cut in at the running path's float (cutInWindow): it flows whatever its k. */
  cutIn: boolean;
  nowSec: number;
}
export interface ComboStep {
  state: ComboState;
  /** This press flowed out of the last move. */
  flowed: boolean;
  /** The label the mode shows now, or null: "N-MOVE COMBO" at COMBO_SHOW_AT and up; HESI CROSS for a crossing pick flowed out of a hesi. */
  label: string | null;
}

/** The crossings a hesi flows into — the hesi cross (a crossover, or the momentum cross at pace). */
const HESI_CROSS_FROM = new Set(['crossover', 'momentum_cross']);

/** One press. */
export function pressCombo(st: ComboState, p: ComboPress): ComboStep {
  const flowed = p.runningK !== null ? (p.cutIn || p.runningK >= COMBO_OPEN_K) : p.nowSec - st.endedAt <= COMBO_GRACE_SEC;
  const count = flowed ? st.count + 1 : 1;
  const hesiCross = flowed && HESI_CROSS_FROM.has(p.move) && (p.runningName ?? st.last) === 'hesi';
  const label = count >= COMBO_SHOW_AT ? `${count}-MOVE COMBO` : hesiCross ? 'HESI CROSS' : null;
  return { state: { count, endedAt: p.runningK !== null ? -Infinity : st.endedAt, last: p.move }, flowed, label };
}
/** A move ended (the carry's 'end'): the grace starts now. */
export function endCombo(st: ComboState, nowSec: number): ComboState {
  return { ...st, endedAt: nowSec };
}

/**
 * The flow of one body — what a HandleHost carries (`flow`). requestMove presses it and stamps the end of every move it starts; the mode
 * takes the label once (takeLabel) and shows it.
 */
export class ComboFlow {
  state: ComboState = COMBO_IDLE;
  private label: string | null = null;
  constructor(private readonly clock: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000) {}
  press(p: Omit<ComboPress, 'nowSec'>): ComboStep {
    const s = pressCombo(this.state, { ...p, nowSec: this.clock() });
    this.state = s.state; if (s.label) this.label = s.label;
    return s;
  }
  ended(): void { this.state = endCombo(this.state, this.clock()); }
  /** The label to show, once (null when there is none). */
  takeLabel(): string | null { const l = this.label; this.label = null; return l; }
  reset(): void { this.state = COMBO_IDLE; this.label = null; }
}
