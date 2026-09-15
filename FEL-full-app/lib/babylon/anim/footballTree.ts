// footballTree — Mode 4 Phase 8: the football animation blend tree.
// Same discipline as basketballTree/combatTree/boardTree: one pure
// decision fn, one deduping wiring class, all clips registry-resolvable.
//
// BIOMECH-WAVE2 (2026-09-09). This tree was written, unit-tested (scripts/football-anim-tests.ts) and NEVER WIRED INTO
// A MODE. FootballRushMode played clips from five places at once — a per-frame `animator.play(footballCarryRun, { loop:
// true })` inside update(), the dodge's own one-shot with an onEnd chain, the truck's play, the tackle's play and the
// touchdown celebrate — and `CharacterAnimator.play` only dedupes the SAME clip, so the per-frame carry-run cut every
// one-shot the frame after it started. Measured on 2942860, per rendered frame: the TOUCHDOWN SPIKE never played (one
// frame, then the carry run, then the drive reset on the same frame); the truck's own play was a no-op that re-armed
// nothing; and the tackle only survived because a separate `downed` flag happened to gate the per-frame call.
//
// Two things were wrong with the tree itself, so wiring it as written would have shipped its own bugs:
//   1. it had NO ONE-SHOT SETTLE — the spike, the juke, the tackle would each hold their last frame forever, which is
//      exactly the stranded-clip class the ANIM-READABILITY pass fixed everywhere else. It now passes its own onEnd
//      for every one-shot, settles into AFTER_ONESHOT with that one-shot's trigger cleared, ignores the callback when
//      the tree itself cut the clip (state + token guard), and reports the natural end through `onSettle`.
//   2. the carry ran `football_sprint_return`, a FREE-ARM sprint, in a mode whose entire verb set is carrying the ball.
//      The authored tucked-ball carry (`football_carry_run`, MODE-STICK-FACE) is the clip the live mode was already
//      using — the tree would have regressed it. Carry / route / truck all ride it now.

import type { CharacterAnimator } from './CharacterAnimator';

export type FootballAnimState =
  | 'presnap_idle' | 'snap' | 'dropback' | 'throw'
  | 'route_run' | 'carry' | 'juke' | 'spin' | 'stiff_arm' | 'truck'
  | 'catch_clean' | 'catch_contested' | 'tackled' | 'block' | 'rush'
  | 'celebrate' | 'dejected';

export interface FootballAnimInput {
  presnap: boolean;
  snapped: boolean;
  isQB: boolean;
  droppingBack: boolean;
  throwing: boolean;
  runningRoute: boolean;
  carrying: boolean;
  move: 'juke' | 'spin' | 'stiffArm' | 'truck' | null;
  /** The move's own clip (a juke has a side; the table's default is the left one). */
  moveClip?: string;
  catching: 'none' | 'clean' | 'contested';
  beingTackled: boolean;
  blocking: boolean;
  rushing: boolean;
  celebrating?: boolean;
  dejected?: boolean;
}

export interface FootballClipChoice { state: FootballAnimState; clip: string; loop: boolean; fadeSec: number }

const CLIP_FOR: Record<FootballAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  presnap_idle:    { clip: 'idle_stand', loop: true, fadeSec: 0.25 },
  snap:            { clip: 'idle_stand', loop: false, fadeSec: 0.1 },
  dropback:        { clip: 'walk_forward', loop: true, fadeSec: 0.15 },
  throw:           { clip: 'football_throw', loop: false, fadeSec: 0.06 },   // RECOGNISABLE: the pass (was the stiff arm = the jab)
  route_run:       { clip: 'football_carry_run', loop: true, fadeSec: 0.12 },   // BIOMECH-WAVE2 G2: the tucked-ball carry, not the free-arm sprint
  carry:           { clip: 'football_carry_run', loop: true, fadeSec: 0.1 },
  juke:            { clip: 'football_juke_left', loop: false, fadeSec: 0.06 },
  spin:            { clip: 'football_spin_move', loop: false, fadeSec: 0.06 },
  stiff_arm:       { clip: 'football_stiff_arm', loop: false, fadeSec: 0.06 },
  truck:           { clip: 'football_carry_run', loop: true, fadeSec: 0.08 },
  catch_clean:     { clip: 'jump_up', loop: false, fadeSec: 0.08 },
  catch_contested: { clip: 'jump_up', loop: false, fadeSec: 0.05 },
  tackled:         { clip: 'football_tackled_fall', loop: false, fadeSec: 0.05 },
  block:           { clip: 'idle_stand', loop: true, fadeSec: 0.15 },   // SHARED-ANIM-BUS: was the hoops defend stance (no football block clip is authored; the rush never blocks)
  rush:            { clip: 'run_forward', loop: true, fadeSec: 0.1 },
  celebrate:       { clip: 'football_td_spike', loop: false, fadeSec: 0.12 },   // SHARED-ANIM-BUS: the authored spike (the old name aliased onto the karate uppercut)
  dejected:        { clip: 'football_tackled_fall', loop: false, fadeSec: 0.2 },
};

export function chooseFootballClip(i: FootballAnimInput): FootballClipChoice {
  let state: FootballAnimState;
  if (i.beingTackled) state = 'tackled';
  else if (i.celebrating) state = 'celebrate';
  else if (i.dejected) state = 'dejected';
  else if (i.catching === 'contested') state = 'catch_contested';
  else if (i.catching === 'clean') state = 'catch_clean';
  else if (i.move) state = i.move === 'stiffArm' ? 'stiff_arm' : i.move;
  else if (i.throwing) state = 'throw';
  else if (i.droppingBack) state = 'dropback';
  else if (i.carrying) state = 'carry';
  else if (i.runningRoute) state = 'route_run';
  else if (i.blocking) state = 'block';
  else if (i.rushing) state = 'rush';
  else if (i.snapped) state = 'snap';
  else state = 'presnap_idle';
  const c: FootballClipChoice = { state, ...CLIP_FOR[state] };
  if (i.moveClip && (state === 'juke' || state === 'spin' || state === 'stiff_arm')) c.clip = i.moveClip;
  return c;
}

/** Where a finished one-shot settles while its trigger still holds. A tackle and a spike HOLD (the mode owns when the
 *  body gets up / the next drive starts); every other one-shot re-chooses from the context with its own trigger
 *  cleared, so a juke that runs out under a held stick lands on the carry run, not a pre-snap idle flash. */
const isOneShot = (s: FootballAnimState): boolean => !CLIP_FOR[s].loop;
export function settleAfter(st: FootballAnimState, i: FootballAnimInput): FootballClipChoice {
  switch (st) {
    case 'tackled': case 'dejected': return { state: st, ...CLIP_FOR[st] };   // held: the reset lets him up
    case 'celebrate': return chooseFootballClip({ ...i, celebrating: false });
    case 'juke': case 'spin': case 'stiff_arm': return chooseFootballClip({ ...i, move: null });
    case 'catch_clean': case 'catch_contested': return chooseFootballClip({ ...i, catching: 'none' });
    case 'throw': return chooseFootballClip({ ...i, throwing: false });
    case 'snap': return chooseFootballClip({ ...i, snapped: false });
    default: return chooseFootballClip(i);
  }
}

export class FootballAnimTree {
  private current: FootballAnimState | null = null;
  /** A one-shot that ran out while its trigger still holds; re-armed when the trigger drops or the beat is cleared. */
  private spent: FootballAnimState | null = null;
  private token = 0;
  private lastInput: FootballAnimInput | null = null;
  /** Fires when a one-shot ENDS on its own (never when the tree cut it) — the mode clears its move / beat here. */
  onSettle: ((state: FootballAnimState) => void) | null = null;
  constructor(private animator: CharacterAnimator) {}
  get state(): FootballAnimState | null { return this.current; }
  update(input: FootballAnimInput): FootballAnimState {
    this.lastInput = input;
    let c = chooseFootballClip(input);
    if (this.spent && c.state !== this.spent) this.spent = null;
    if (this.spent && c.state === this.spent) c = settleAfter(this.spent, input);
    if (c.state !== this.current) this.enter(c);
    return c.state;
  }
  private enter(c: FootballClipChoice): void {
    const st = c.state;
    const tok = ++this.token;
    const onEnd = isOneShot(st) ? () => {
      // Fires on a natural end — and also when the animator cuts this clip for the next one (Babylon raises the group's
      // end observable from stop()). Only the natural case is ours.
      if (this.current !== st || this.token !== tok) return;
      this.spent = st;
      this.onSettle?.(st);
      const after = settleAfter(st, this.lastInput ?? EMPTY_INPUT);
      if (after.state !== st) this.enter(after);
    } : undefined;
    this.animator.play(c.clip, onEnd ? { loop: c.loop, fadeSec: c.fadeSec, onEnd } : { loop: c.loop, fadeSec: c.fadeSec });
    this.current = st;
  }
  /** The mode's beat window closed (or a NEW beat of the same kind landed): forget it so the next update re-chooses. */
  clearBeat(...states: FootballAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
    if (this.spent && states.includes(this.spent)) this.spent = null;
  }
  reset(): void { this.current = null; this.spent = null; this.lastInput = null; }
}

const EMPTY_INPUT: FootballAnimInput = {
  presnap: true, snapped: false, isQB: false, droppingBack: false, throwing: false,
  runningRoute: false, carrying: false, move: null, catching: 'none',
  beingTackled: false, blocking: false, rushing: false,
};
