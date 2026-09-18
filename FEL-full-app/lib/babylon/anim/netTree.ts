// netTree — the net-sport animation tree (tennis / volleyball), and the ONE OWNER of a net player's clips.
//
// Same discipline as boardTree / combatTree / freeRunTree: one pure decision function maps the rally context to a clip
// + loop + fade, one thin class dedupes per-frame play(). States: the READY bounce, the two SHUFFLES along the baseline,
// and the three beats — SWING (forehand / spike), SERVE, BLOCK.
//
// ANIM-READABILITY (net / precision, 2026-09-07). NetSportMode played clips from two places: the per-frame baseline
// shuffle (idle_stand / strafe_left / strafe_right, a 700 ms "busy" guard around a swing) and the swing's own one-shot with
// a neverBindPose chain back to idle_stand. Measured per rendered frame on the fake pad: every swing that ran out under a
// held stick settled into idle_stand for 0.08 s before the shuffle's play replaced it — a 0.33–0.47 m hand pop at every
// swing-to-shuffle settle (4 in a 29 s tennis rally); the player shuffled with both arms HANGING (the generic strafe:
// hands 0.99 m up, a racket at the knee) and waited in idle_stand instead of the authored ready bounce; the serve was the
// forehand; the block was the spike. Now the tree is the only thing that plays on a net body: it passes its own onEnd
// for every beat, settles a finished beat from the context with that beat's trigger cleared (a swing that ran out under
// a held stick lands on the shuffle — no idle flash), ignores the callback when the tree itself cut the clip (state +
// token guard), and the loops are the sport's own (ready bounce, ready shuffles).

import type { CharacterAnimator } from './CharacterAnimator';

export type NetAnimState = 'ready' | 'shuffle_left' | 'shuffle_right' | 'swing' | 'serve' | 'block';

/** The sport's clip set — tennis and volleyball author their own ready, shuffles, swing, serve and block. */
export interface NetClipSet {
  ready: string;
  shuffleLeft: string;
  shuffleRight: string;
  swing: string;
  /** The serve; the swing when the sport has no separate serve motion. */
  serve: string;
  /** The block (volleyball); the swing when the sport has no block. */
  block: string;
}

export interface NetAnimInput {
  /** Lateral intent in the BODY frame: < 0 the body's left, > 0 its right, 0 still. The mode resolves the screen /
   *  camera mapping; the tree only picks the shuffle. */
  move: number;
  /** One-beat latches: set by the mode, cleared on `onSettle` (or by the mode when the rally ends the beat early). */
  swing: boolean;
  serve: boolean;
  block: boolean;
}

export interface NetClipChoice { state: NetAnimState; clip: string; loop: boolean; fadeSec: number }

const FADE: Record<NetAnimState, number> = { ready: 0.2, shuffle_left: 0.15, shuffle_right: 0.15, swing: 0.08, serve: 0.1, block: 0.06 };
const LOOP: Record<NetAnimState, boolean> = { ready: true, shuffle_left: true, shuffle_right: true, swing: false, serve: false, block: false };

const clipOf = (state: NetAnimState, c: NetClipSet): string => {
  switch (state) {
    case 'ready': return c.ready;
    case 'shuffle_left': return c.shuffleLeft;
    case 'shuffle_right': return c.shuffleRight;
    case 'swing': return c.swing;
    case 'serve': return c.serve;
    case 'block': return c.block;
  }
};
const pick = (state: NetAnimState, c: NetClipSet): NetClipChoice => ({ state, clip: clipOf(state, c), loop: LOOP[state], fadeSec: FADE[state] });

/** The single decision: rally context in, clip choice out. Pure. Beats outrank the loops; a swing outranks a serve
 *  outranks a block (the mode never holds two, the order only settles a same-frame race). */
export function chooseNetClip(i: NetAnimInput, c: NetClipSet): NetClipChoice {
  let state: NetAnimState;
  if (i.swing) state = 'swing';
  else if (i.serve) state = 'serve';
  else if (i.block) state = 'block';
  else if (i.move < 0) state = 'shuffle_left';
  else if (i.move > 0) state = 'shuffle_right';
  else state = 'ready';
  return pick(state, c);
}

/** Where a finished beat settles: re-chosen from the context with its OWN trigger cleared, so a swing that ran out
 *  under a held stick lands on the shuffle, not on the ready for a frame. */
export function settleNetAfter(st: NetAnimState, i: NetAnimInput, c: NetClipSet): NetClipChoice {
  switch (st) {
    case 'swing': return chooseNetClip({ ...i, swing: false }, c);
    case 'serve': return chooseNetClip({ ...i, serve: false }, c);
    case 'block': return chooseNetClip({ ...i, block: false }, c);
    default: return chooseNetClip(i, c);
  }
}

/** The one owner of a net player's clips (per-frame safe). */
export class NetAnimTree {
  private current: NetAnimState | null = null;
  /** A beat that ran out while its latch still holds; re-armed when the latch drops or the beat is cleared. */
  private spent: NetAnimState | null = null;
  private token = 0;
  private lastInput: NetAnimInput | null = null;
  /** Fires when a beat ENDS on its own (never when the tree cut it) — the mode clears its latch here. */
  onSettle: ((state: NetAnimState) => void) | null = null;
  constructor(private animator: CharacterAnimator, private clips: NetClipSet) {}
  get state(): NetAnimState | null { return this.current; }
  update(input: NetAnimInput): NetAnimState {
    this.lastInput = input;
    let c = chooseNetClip(input, this.clips);
    if (this.spent && c.state !== this.spent) this.spent = null;
    if (this.spent && c.state === this.spent) c = settleNetAfter(this.spent, input, this.clips);
    if (c.state !== this.current) this.enter(c);
    return c.state;
  }
  private enter(c: NetClipChoice): void {
    const st = c.state;
    const tok = ++this.token;
    const onEnd = c.loop ? undefined : () => {
      // Fires on a natural end — and also when the animator cuts this clip for the next one (Babylon raises the group's
      // end observable from stop()). Only the natural case is ours: the tree must still be sitting in this state.
      if (this.current !== st || this.token !== tok) return;
      this.spent = st;
      this.onSettle?.(st);
      this.enter(settleNetAfter(st, this.lastInput ?? EMPTY_INPUT, this.clips));
    };
    this.animator.play(c.clip, onEnd ? { loop: c.loop, fadeSec: c.fadeSec, onEnd } : { loop: c.loop, fadeSec: c.fadeSec });
    this.current = st;
  }
  /** A beat must be re-playable: call when a NEW beat of the same kind lands (a second swing in a three-touch rally). */
  clearBeat(...states: NetAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
    if (this.spent && states.includes(this.spent)) this.spent = null;
  }
  /** True while a beat is the current state. */
  get busy(): boolean { return this.current !== null && !LOOP[this.current]; }
  reset(): void { this.current = null; this.spent = null; this.lastInput = null; }
}

const EMPTY_INPUT: NetAnimInput = { move: 0, swing: false, serve: false, block: false };

/** Tennis: the authored racket set. No block — a volley is the swing. */
export const TENNIS_CLIPS: NetClipSet = {
  ready: 'tennis_ready', shuffleLeft: 'tennis_shuffle_left', shuffleRight: 'tennis_shuffle_right',
  swing: 'tennis_swing', serve: 'tennis_serve', block: 'tennis_swing',
};
/** Volleyball: the authored net set. The overhand serve is the spike motion. */
export const VOLLEYBALL_CLIPS: NetClipSet = {
  ready: 'volleyball_ready', shuffleLeft: 'volleyball_shuffle_left', shuffleRight: 'volleyball_shuffle_right',
  swing: 'volleyball_spike', serve: 'volleyball_spike', block: 'volleyball_block',
};
/** Seconds into each beat where the racket / hand meets the ball — a serve launches the ball on this beat. */
export const NET_CONTACT_SEC: Record<string, number> = { tennis_swing: 0.3, tennis_serve: 0.6, volleyball_spike: 0.38, volleyball_block: 0.25 };
