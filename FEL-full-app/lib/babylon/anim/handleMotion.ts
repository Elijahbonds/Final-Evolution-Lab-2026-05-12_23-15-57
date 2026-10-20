// handleMotion — ONE RENDERER FOR THE HANDLE MOVES, 1v1 and 3v3 (HOOPS MOTION phase 4b, 2026-09-29; plan §3.4).
//
// The stick block, doMove and the left-stick crossover were written twice, once per mode, and neither moved the ball: the R-stick
// handles played a clip over a dribble that never crossed (3a: the ball drawn on the right 99–100 % of every cross / between / behind
// window), and the ball's side and the clip's side were two values read in two frames (S31). The memory rule applies — put the response
// in the shared channel, not in N modes. This module is the RENDER: the clip, the ball's path (the carry's runMove, or queueMove behind a
// move already running), the pace, which hand the ball ends in, and the impulse. The DECISION stays where it was: each call site passes
// its own `decide` (its own DefenderRead builder and its own RNG — 1v1 its seeded `roll`, 3v3 Math.random), run exactly once, on the
// input frame, before anything is rendered; `owned: false` renders nothing and `restarted` renders the move without its impulse, as
// today. The defender's clip beat at readAtK and the posture windows are 4e / 4f's; the tree's hand-back is the carry's hand (the tree's
// ballHand input).
//
// THE SIDES (one value for the clip and the ball — S31 / U10 closed): a move that crosses once ends in the OTHER hand whatever the
// defender read says (§3.1), and its clip is named for that side (MOVE_CLIP's `dir`: the side the ball ends on); a move that does not
// cross, or crosses twice, ends in the hand it started in. The left-stick reversal's rule (§3.4): a crossing pick crosses to the cut's
// side — and a crossing pick whose cut side is the ball's side already renders its SAME-HAND TWIN (the in-and-out: never a crossing into
// the defender, owner Q4); a same-hand pick keeps the hand while the cut still turns the body; off the head is the mode's.
//
// THE IMPULSE (U18, gameplay): signed by the move (impulseFor), not "away from him" — a crossing move's body goes with the ball.
import { MOVE_SHAPE, MOVE_TURBO_REAL, flickClip, impulseFor, moveClip, moveFadeSec, moveRate, type HandleMove, type MoveImpulse, type MoveOutcome } from '../core/HandleSystem';
import type { BallCarry } from './ballCarry';
import type { PathMove } from './handlePaths';
import type { ComboFlow } from './comboFlow';

export type Side = 'left' | 'right';
/** What a call site decides (plan §3.4): the render is shared, the decision is the call site's own. */
export type HandleDecide =
  /** HandleSystem.resolveHandleMove with the call site's read and RNG; `owned` / `restarted` come back as today. */
  | { kind: 'resolve'; run: () => MoveOutcome }
  /** A link with no read (the step-back's `present: false`). */
  | { kind: 'chainOnly'; run: () => void }
  /** The call site's own decision (the jab's odds, the snatchback's read, the spin's exit link). */
  | { kind: 'custom'; run: () => void }
  /** No decision (the size-up, PAUSIN', the rival). */
  | { kind: 'none' };
/** A handle move, or the triple threat's JAB (not a HandleMove: its decision is the threat's own, its path a pound, its clip the call
 *  site's). */
export type RenderMove = HandleMove | 'jab';
export interface HandleRequest {
  move: RenderMove;
  /** A side the call site names — the R-stick's (the side the ball ends on), a sweep's rotation — or undefined. */
  hint?: Side;
  /** The left-stick reversal's cut side (see the header): a crossing pick crosses to it, or renders its same-hand twin when the ball is on
   *  it already; a same-hand pick keeps the hand. */
  cutSide?: Side;
  decide: HandleDecide;
  /** Apply the move's impulse (impulseFor) — only where the call site applied moveImpulse today. */
  impulse?: boolean;
  /** A left-stick flick: a move with no clip of its own plays the crossover's (flickClip). */
  flick?: boolean;
  /** The turbo: today's MOVE PACE for the clip (moveRate / moveFadeSec), the turbo's real-speed pace for the path (MOVE_TURBO_REAL). */
  turbo?: boolean;
  /** The clip to beat instead of MOVE_CLIP's (a size-up's, the step-back's, the jab's); null: no clip. */
  clip?: string | null;
  /** H2: a sided clip of the call site's own, named for the ball's END side like MOVE_CLIP's (the BTB slide: the behind-the-back's
   *  decision and path, its own body). Ignored for a same-hand twin, like `clip`. */
  clipFor?: (dir: Side) => string;
  /** The ball's path: the move whose path runs (default the rendered move's own), or false (none: the carry bounces through it). */
  path?: PathMove | false;
  fadeSec?: number; speedRatio?: number;
}
/** The body the renderer plays on: its carry, its tree's beat, its impulse (in its own frame: forward along the facing, lateral + toward
 *  the athlete's right). */
export interface HandleHost {
  carry: Pick<BallCarry, 'runMove' | 'queueMove' | 'move' | 'hand'> | null;
  beat(clip: string, opts: { fadeSec: number; speedRatio: number }): void;
  impulse?(forward: number, lateral: number): void;
  /** hoops-moves (owner 2026-10-20, the combo window — anim/comboFlow): this body's flow. Each request presses it (the count, the label)
   *  and a queued move cuts in at the running path's float top (the hesi); absent, requests render exactly as before. */
  flow?: ComboFlow;
}
export interface HandleResult {
  owned: boolean; restarted: boolean; outcome: MoveOutcome | null;
  /** When the clip beats: now, or when its queued path STARTS (the running move's catch — 4b review F2), or never (no clip). */
  clipAt: 'now' | 'start' | 'none';
  /** The move rendered: the pick, or its same-hand twin. */
  rendered: RenderMove; twin: boolean;
  startHand: Side; endHand: Side;
  /** The clip's side: the ball's end side (one value, S31). */
  clipDir: Side; clip: string | null;
  ball: 'started' | 'queued' | 'none';
  impulse: MoveImpulse | null;
}

/**
 * HOOPS MOTION phase 4c (plan §4.1): THE CROSSOVER'S A/B. The crossover (and the momentum cross) play the v2 AUTHORED clip — built on its
 * own path (anim/authored/basketball.ts buildHandleV2) — by default; `?hm4cross=cap` (dev) plays the phase-1 capture (CMU 06_13, by its own
 * name: it no longer stands in for the authored clip) so the two are measured on the same takes (pops, the name verdict).
 */
export type CrossSource = 'auth' | 'cap';
export function crossSourceOverride(search: string | null | undefined, dev: boolean): CrossSource {
  return dev && !!search && /[?&]hm4cross=cap\b/.test(search) ? 'cap' : 'auth';
}
const CROSS_SOURCE: CrossSource = crossSourceOverride(typeof location !== 'undefined' ? location.search : null, process.env.NODE_ENV === 'development');
/** The clip a crossover plays under the A/B: the capture by its own name, or the clip asked for. */
export function crossClip(clip: string | null, src: CrossSource = CROSS_SOURCE): string | null {
  if (!clip || src !== 'cap') return clip;
  const m = /^bball_(crossover|momentum_cross)_(left|right)$/.exec(clip);
  return m ? `bball_mc_crossover_${m[2]}` : clip;
}

/** The same-hand twin of a crossing move (plan §4.1, owner Q4: a crossing pick toward the ball's own side fakes and keeps the hand). */
export const SAME_HAND_TWIN: Readonly<Partial<Record<HandleMove, HandleMove>>> = {
  crossover: 'in_and_out', momentum_cross: 'in_and_out', between_legs: 'in_and_out', behind_back: 'in_and_out', momentum_btb: 'in_and_out',
  snatch_back: 'in_and_out', shammgod: 'in_and_out',
};
/** How many times a path's ball crosses the midline (MOVE_SHAPE for a HandleMove; the jab's and PAUSIN's never cross). */
export const pathCrosses = (m: PathMove): number => (m in MOVE_SHAPE ? MOVE_SHAPE[m as HandleMove].crosses : 0);
const otherSide = (s: Side): Side => (s === 'right' ? 'left' : 'right');
/** The jab's row (not in MOVE_SHAPE): no crossing, a pound, no impulse (the jab's burst is the threat's, on the next step). */
const JAB_SHAPE = { crosses: 0, path: 'pound', impulse: false, owner: 'motion' } as const;
const shapeOf = (m: RenderMove) => (m === 'jab' ? JAB_SHAPE : MOVE_SHAPE[m]);
/** The size-up cycle's clip → the move it plays (StickHandle.SIZE_UP_CYCLE: the yoyo, the in-and-out, the between-the-legs). */
export function sizeUpMoveOf(clip: string): HandleMove { return /yoyo/.test(clip) ? 'yoyo' : /between/.test(clip) ? 'between_legs' : 'in_and_out'; }

/** The sides of a move (pure): the rendered move (the twin rule), the hand it ends in, the clip's side, the side the body goes. */
export function resolveSides(move: RenderMove, startHand: Side, o: { hint?: Side; cutSide?: Side; path?: PathMove | false } = {}): { rendered: RenderMove; twin: boolean; endHand: Side; clipDir: Side; impulseDir: Side } {
  const twinOf = move === 'jab' ? undefined : SAME_HAND_TWIN[move];
  if (o.cutSide && o.cutSide === startHand && twinOf && shapeOf(move).crosses === 1) return { rendered: twinOf, twin: true, endHand: startHand, clipDir: startHand, impulseDir: o.cutSide };
  const pm: PathMove | null = o.path === false ? null : (o.path ?? move);
  const crosses = pm ? pathCrosses(pm) : shapeOf(move).crosses;
  if (crosses % 2 === 1) { const end = otherSide(startHand); return { rendered: move, twin: false, endHand: end, clipDir: end, impulseDir: end }; }
  // a move the MODE resolves (off the head: the mode throws the ball) keeps the hand here; its flick's body is the crossover toward the cut
  const side = o.cutSide ?? o.hint ?? startHand;
  return { rendered: move, twin: false, endHand: startHand, clipDir: move !== 'jab' && MOVE_SHAPE[move].owner === 'mode' ? side : startHand, impulseDir: side };
}

/** Render one handle move (see the header). The decision runs first, exactly once.
 *  A MOVE ALREADY RUNNING (4b review F2, plan §3.4 step 1: "it queues, or buffers one request"): the carry holds ONE queued path, and a
 *  later request REPLACES it — so this request starts from the RUNNING move's end hand (the carry's `hand` counts the queued move's
 *  crossing, which this request is about to replace), and its clip beats when its path STARTS (the carry's 'start' event, at the running
 *  move's catch), not now: a replaced request renders nothing (its decision and its impulse were this frame's, as today), and the clip
 *  that plays always names the hand the ball really goes to. Three requests 6 frames apart used to play left, right, left clips over a
 *  ball that ended in the right hand (the 4b probe's Shammgod, 0/5 on its drawn side). */
export function requestMove(host: HandleHost, req: HandleRequest): HandleResult {
  const carry = host.carry;
  const running = carry?.move ?? null;
  const startHand: Side = running ? running.endHand : carry && carry.hand === 'Left' ? 'left' : 'right';
  let owned = true, restarted = false, outcome: MoveOutcome | null = null;
  if (req.decide.kind === 'resolve') { outcome = req.decide.run(); owned = outcome.owned; restarted = outcome.restarted; }
  else if (req.decide.kind !== 'none') req.decide.run();
  if (!owned) return { owned, restarted, outcome, clipAt: 'none', rendered: req.move, twin: false, startHand, endHand: startHand, clipDir: startHand, clip: null, ball: 'none', impulse: null };
  const flow = host.flow;
  const cutIn = !!flow && !!running?.cutIn && running.t <= running.cutIn.to;   // the combo window's cut-in is still ahead or open (comboFlow)
  const onEnd = (e: string): void => { if (e === 'end') flow?.ended(); };
  const sides = resolveSides(req.move, startHand, { hint: req.hint, cutSide: req.cutSide, path: req.path });
  const { rendered, twin, endHand, clipDir } = sides;
  const turbo = !!req.turbo;
  const clip = crossClip(req.clip !== undefined && !twin ? req.clip : req.clipFor && !twin ? req.clipFor(clipDir) : rendered === 'jab' ? null : req.flick ? flickClip(rendered, clipDir) : moveClip(rendered, clipDir));
  const beat = (): void => { if (clip) host.beat(clip, { fadeSec: req.fadeSec ?? moveFadeSec(turbo), speedRatio: req.speedRatio ?? moveRate(turbo) }); };
  // the ball: now, or at the running move's catch (a double request: the double cross); a move with no path of its own bounces through
  let ball: HandleResult['ball'] = 'none', clipAt: HandleResult['clipAt'] = clip ? 'now' : 'none';
  const pm: PathMove | null = req.path === false ? null : twin ? rendered : (req.path ?? (shapeOf(rendered).path === 'none' ? null : rendered));
  if (pm && carry && running) {
    let beaten = false;
    const queued = carry.queueMove(pm, { pace: turbo ? MOVE_TURBO_REAL : 1, cutIn, onEvent: (e) => { onEnd(e); if (e === 'start' && !beaten) { beaten = true; beat(); } } });
    ball = queued ? 'queued' : 'none';
    if (queued) clipAt = clip ? 'start' : 'none'; else beat();
  } else {
    beat();
    if (pm && carry) ball = carry.runMove(pm, { pace: turbo ? MOVE_TURBO_REAL : 1, onEvent: flow ? onEnd : undefined }) ? 'started' : 'none';
  }
  if (flow && req.move !== 'jab') flow.press({ move: req.move, runningK: running ? running.k : null, runningName: running?.name ?? null, cutIn: cutIn && ball === 'queued' });
  // the impulse where the call site applied one today: owned, not restarted, not a move the mode resolves itself (off the head)
  let impulse: MoveImpulse | null = null;
  if (req.impulse && !restarted && req.move !== 'jab' && MOVE_SHAPE[req.move].owner === 'motion') {
    const i = impulseFor(req.move, sides.impulseDir);
    if (i.forward !== 0 || i.lateral !== 0) { impulse = i; host.impulse?.(i.forward, i.lateral); }
  }
  return { owned, restarted, outcome, clipAt, rendered, twin, startHand, endHand, clipDir, clip, ball, impulse };
}
