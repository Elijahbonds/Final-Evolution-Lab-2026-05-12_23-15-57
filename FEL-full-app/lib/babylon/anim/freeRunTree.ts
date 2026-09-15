// freeRunTree — the free-running animation blend tree, and the ONE OWNER of the runner's clips.
//
// Same discipline as boardTree / combatTree: ONE pure decision function maps the run's context to clip + loop + fade,
// one thin class dedupes per-frame play(). States: idle / walk / run, the jump (take-off one-shot → the air hold), the
// air hold, the tuck (a flip / twist), the wall run, the slide, the landing (clean / sketchy), the bail → the floor →
// the get-up, and the finish celebrate.
//
// ANIM-READABILITY (creative, 2026-09-07). FreeRunMode played clips through a name-deduped helper from nine places, and
// measured per rendered frame on the fake pad: the per-frame ground play (run / walk / idle) cut every landing to
// 0.03–0.07 s (jump_land is 0.35 s); the take-off ran out mid-air and neverBindPose's chain dropped the runner into
// idle_stand for the rest of the flight (0.8 s standing in the sky); and the chained idle played from INSIDE the
// animator's fade handler stranded the run at weight 1 through every jump (4 clip fights, the longest 49 frames:
// jump_up + run, board_air + run at full weight together). The tree passes its own onEnd for every one-shot, settles it
// from the context with its trigger cleared (a landing under a held stick lands on the run), ignores the callback when
// the tree itself cut the clip (state + token guard), and holds the floor after a bail until the mode lets him rise.

import type { CharacterAnimator } from './CharacterAnimator';

export type FreeRunAnimState =
  | 'idle' | 'walk' | 'run'
  | 'jump' | 'air' | 'tuck' | 'wallrun' | 'slide'
  | 'land_clean' | 'land_sketchy'
  | 'bail' | 'floor' | 'get_up'
  | 'celebrate';

export interface FreeRunAnimInput {
  speed01: number;
  airborne: boolean;
  /** One-beat: the take-off just happened (jump / vault / wall kick / drop) — plays the take-off clip, then the air hold. */
  jumpBeat: boolean;
  /** A flip / twist is spinning the root. */
  tricking: boolean;
  wallrun: boolean;
  sliding: boolean;
  /** One-beat: touchdown. */
  landing: 'none' | 'clean' | 'sketchy';
  /** Bailed: fall, then the floor until it drops. */
  down: boolean;
  celebrating?: boolean;
  /** PARKOUR (2026-09-15): a captured move for this beat, when the rig owns one — the speed vault for a vault take-off,
   *  the dive roll for a rolled landing, the underbar for a slide under a bar. Omitted = the base clip. */
  takeoffClip?: string | null;
  landClip?: string | null;
  slideClip?: string | null;
}

export interface FreeRunClipChoice { state: FreeRunAnimState; clip: string; loop: boolean; fadeSec: number }

const CLIP_FOR: Record<FreeRunAnimState, { clip: string; loop: boolean; fadeSec: number }> = {
  idle:         { clip: 'idle_stand', loop: true, fadeSec: 0.2 },
  walk:         { clip: 'walk', loop: true, fadeSec: 0.15 },
  run:          { clip: 'run', loop: true, fadeSec: 0.12 },
  jump:         { clip: 'jump_up', loop: false, fadeSec: 0.08 },
  air:          { clip: 'freerun_air_hold', loop: true, fadeSec: 0.14 },
  tuck:         { clip: 'freerun_tuck', loop: true, fadeSec: 0.16 },   // overhead → the shins is 1.3 m of hand travel: 0.16 s keeps it under 0.15 m a frame
  wallrun:      { clip: 'run', loop: true, fadeSec: 0.1 },
  slide:        { clip: 'freerun_slide', loop: true, fadeSec: 0.1 },
  land_clean:   { clip: 'jump_land', loop: false, fadeSec: 0.06 },
  land_sketchy: { clip: 'jump_land', loop: false, fadeSec: 0.06 },
  bail:         { clip: 'football_tackled_fall', loop: false, fadeSec: 0.06 },
  floor:        { clip: 'karate_floor_hold', loop: true, fadeSec: 0.15 },
  get_up:       { clip: 'karate_get_up', loop: false, fadeSec: 0.1 },
  celebrate:    { clip: 'dunk_celebrate_big', loop: false, fadeSec: 0.15 },
};
const pick = (state: FreeRunAnimState): FreeRunClipChoice => ({ state, ...CLIP_FOR[state] });

/** The single decision: run context in, clip choice out. Pure. */
export function chooseFreeRunClip(i: FreeRunAnimInput): FreeRunClipChoice {
  let state: FreeRunAnimState;
  if (i.down) state = 'bail';
  else if (i.celebrating) state = 'celebrate';
  else if (i.landing !== 'none' && !i.airborne) state = i.landing === 'sketchy' ? 'land_sketchy' : 'land_clean';
  else if (i.wallrun) state = 'wallrun';
  else if (i.airborne) state = i.tricking ? 'tuck' : i.jumpBeat ? 'jump' : 'air';
  else if (i.sliding) state = 'slide';
  else if (i.speed01 > 0.5) state = 'run';
  else if (i.speed01 > 0.06) state = 'walk';
  else state = 'idle';
  const c = pick(state);
  if (state === 'jump' && i.takeoffClip) c.clip = i.takeoffClip;
  if (state === 'land_clean' && i.landClip) c.clip = i.landClip;
  if (state === 'slide' && i.slideClip) { c.clip = i.slideClip; c.loop = false; }
  return c;
}

export const FLOOR_FAMILY: ReadonlySet<FreeRunAnimState> = new Set<FreeRunAnimState>(['bail', 'floor', 'get_up']);
const isOneShot = (s: FreeRunAnimState): boolean => !CLIP_FOR[s].loop;

/** Where a finished one-shot settles: the bail holds the floor; every other one-shot re-chooses from the context with its
 *  OWN trigger cleared (a take-off that ran out mid-air holds the air pose; a landing under a held stick lands on the run). */
export function settleAfter(st: FreeRunAnimState, i: FreeRunAnimInput): FreeRunClipChoice {
  switch (st) {
    case 'bail': return pick('floor');
    case 'jump': return chooseFreeRunClip({ ...i, jumpBeat: false });
    case 'land_clean': case 'land_sketchy': return chooseFreeRunClip({ ...i, landing: 'none' });
    case 'celebrate': return chooseFreeRunClip({ ...i, celebrating: false });
    default: return chooseFreeRunClip(i);
  }
}

/** The one owner of the runner's clips (per-frame safe). */
export class FreeRunAnimTree {
  private current: FreeRunAnimState | null = null;
  /** A one-shot that ran out while its trigger still holds; re-armed when the trigger drops or the beat is cleared. */
  private spent: FreeRunAnimState | null = null;
  private token = 0;
  private lastInput: FreeRunAnimInput | null = null;
  /** Fires when a one-shot ENDS on its own (never when the tree cut it). */
  onSettle: ((state: FreeRunAnimState) => void) | null = null;
  constructor(private animator: CharacterAnimator) {}
  get state(): FreeRunAnimState | null { return this.current; }
  update(input: FreeRunAnimInput): FreeRunAnimState {
    this.lastInput = input;
    let c = chooseFreeRunClip(input);
    if (this.spent && c.state !== this.spent) this.spent = null;
    if (this.spent && c.state === this.spent) c = settleAfter(this.spent, input);
    const cur = this.current;
    if (cur === 'get_up' && c.state !== 'bail') return cur;                                          // the get-up finishes before any standing state
    if (cur && FLOOR_FAMILY.has(cur) && cur !== 'get_up' && !FLOOR_FAMILY.has(c.state)) c = pick('get_up');   // the floor is left through the get-up
    if (c.state !== cur) this.enter(c);
    return c.state;
  }
  private enter(c: FreeRunClipChoice): void {
    const st = c.state;
    const tok = ++this.token;
    const onEnd = isOneShot(st) ? () => {
      // Fires on a natural end — and also when the animator cuts this clip for the next one (Babylon raises the group's
      // end observable from stop()). Only the natural case is ours: the tree must still be sitting in this state.
      if (this.current !== st || this.token !== tok) return;
      this.spent = st;
      this.onSettle?.(st);
      this.enter(settleAfter(st, this.lastInput ?? EMPTY_INPUT));
    } : undefined;
    this.animator.play(c.clip, onEnd ? { loop: c.loop, fadeSec: c.fadeSec, onEnd } : { loop: c.loop, fadeSec: c.fadeSec });
    this.current = st;
  }
  /** One-beat states must be re-playable: call when the beat window closes or a NEW beat of the same kind lands. */
  clearBeat(...states: FreeRunAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
    if (this.spent && states.includes(this.spent)) this.spent = null;
  }
  reset(): void { this.current = null; this.spent = null; this.lastInput = null; }
}

const EMPTY_INPUT: FreeRunAnimInput = { speed01: 0, airborne: false, jumpBeat: false, tricking: false, wallrun: false, sliding: false, landing: 'none', down: false };
