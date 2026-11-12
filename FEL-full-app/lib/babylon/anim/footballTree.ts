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
import { StrideRateFilter, strideRate } from '../core/StrideMatch';
import { feel } from '../../feel-panel/feel';

export type FootballAnimState =
  | 'presnap_idle' | 'snap' | 'dropback' | 'throw'
  | 'route_run' | 'carry' | 'juke' | 'spin' | 'stiff_arm' | 'truck'
  | 'catch_clean' | 'catch_contested' | 'tackled' | 'block' | 'rush'
  | 'celebrate' | 'dejected' | 'floor_hold';

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
  /** GAMEPLAY-CLEAN P2 #6: the carrier's planar speed (m/s) — the carry loop's stride is paced to it. Absent: the loop runs at 1×. */
  speedMps?: number;
  /** The frame's dt for the stride filter (default 1/60). */
  dtSec?: number;
}

/** GAMEPLAY-CLEAN P2 #6 (2026-11-03): THE CARRY'S STRIDE. `football_carry_run` played at 1× for every speed: the rig measured its planted
 *  feet covering 2.1 m/s of ground against a carrier at 7.7 m/s (stance pace, scratchpad stance.mjs — the base `run` reads 5.0 there,
 *  where LocoBus's calibrated runRef is 4.8, so the probe agrees with the movement probe). MEASURED, not tuned: the speed the clip's
 *  stride matches the ground at, as the carrier wears it (with RunPosture's layer on). */
export const FOOTBALL_CARRY_PACE_MPS = 2.1;
/** TUNE (new): the carry's top playback rate. Matching 7.7 m/s outright would want 3.6× — a cartoon cadence — so the rate stops at
 *  1.4× (0.6 s cycle → 4.7 steps a second, a ball carrier's sprint cadence); the rest of the gap is the clip's short stride, which
 *  is clip work (GATE 0) and is routed, not hidden here. Feel knob `football.carryStrideMax`. */
export const FOOTBALL_CARRY_RATE_MAX = 1.4;
/** OWNER CALL (2026-11-10, delegated; recommended option): the hurdle's own way in. The hurdle rides the stiff-arm slot (its
 *  clip arrives through `moveClip`), so it took that slot's 0.06 s fade: the carry's stride to the jump's tuck in under four
 *  frames. Measured headless on the hero over 24 carry phases (footballTree.hurdleFade.test): the thigh turns 24-25 deg in ONE
 *  frame at 0.06 s (the rig read 26 deg in play), 15-17 deg at 0.12 s, 13-15 deg at 0.15 s; the carry's own stride is 6 deg a
 *  frame, so past ~0.15 s there is little left to win. 0.12 s keeps the tuck inside the first quarter of the 0.5 s hop.
 *  TUNED (flagged): the hurdle's fade 0.06 -> 0.12 s. Feel knob `football.hurdleFadeSec`; 0.06 is the old blend exactly.
 *  The juke, the spin and the stiff arm itself keep 0.06 s. */
export const FOOTBALL_HURDLE_CLIP = 'jump_up';
export const FOOTBALL_HURDLE_FADE_SEC = 0.12;
/** GAMEPLAY-CLEAN P5 (2026-11-10): THE HURDLE'S WAY OUT. The hop's clip (0.5 s) runs out a few frames before the landing and the
 *  tree settles on the carry over the carry's own 0.1 s: the arms come from the jump's reach down to the tuck — the off arm 150° — in
 *  six frames. The rig read it in play as football's last repeating hard pop, the same numbers at every hurdle (LeftArm 31°, RightArm
 *  23°, RightForeArm 15° a frame; GAMEPLAY-CLEAN-AUDIT §4g — §4e had put it down to the carry loop's own keys, which turn the arms
 *  under 7° a frame). Measured headless on the hero over 6 carry phases at 1× and 1.4× (footballTree.hurdleExit.test): the off arm
 *  30.9° a frame at 0.1 s, 19.6° at 0.16, 15.7° at 0.2, 12.6° at 0.25. 0.2 s halves it and is done 8 frames after the feet are down.
 *  TUNED (new, flagged): the hurdle → carry blend 0.1 → 0.2 s. Feel knob `football.hurdleExitFadeSec`; 0.1 is the old blend exactly.
 *  Every other way into the carry (the snap, a juke, a spin, the stiff arm itself) keeps the carry's 0.1 s. */
export const FOOTBALL_HURDLE_EXIT_FADE_SEC = 0.2;
const STRIDE_STATES: ReadonlySet<FootballAnimState> = new Set<FootballAnimState>(['route_run', 'carry', 'truck']);

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
  // SCORECARD BODY (2026-09-15): the fall is a ONE-SHOT, and when it ended the runner had NO clip until the next snap
  // (measured: 4.6 % of the session's samples with nothing playing). It settles into the authored floor hold instead.
  floor_hold:      { clip: 'karate_floor_hold', loop: true, fadeSec: 0.12 },
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
  if (state === 'stiff_arm' && c.clip === FOOTBALL_HURDLE_CLIP) c.fadeSec = feel('football.hurdleFadeSec', FOOTBALL_HURDLE_FADE_SEC);
  return c;
}

/** Where a finished one-shot settles while its trigger still holds. A tackle and a spike HOLD (the mode owns when the
 *  body gets up / the next drive starts); every other one-shot re-chooses from the context with its own trigger
 *  cleared, so a juke that runs out under a held stick lands on the carry run, not a pre-snap idle flash. */
const isOneShot = (s: FootballAnimState): boolean => !CLIP_FOR[s].loop;
export function settleAfter(st: FootballAnimState, i: FootballAnimInput): FootballClipChoice {
  switch (st) {
    case 'tackled': case 'dejected': return { state: 'floor_hold', ...CLIP_FOR.floor_hold };   // down on the turf until the reset lets him up
    case 'floor_hold': return { state: 'floor_hold', ...CLIP_FOR.floor_hold };
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
  private strideFilter = new StrideRateFilter();
  /** P5: what the tree last PLAYED (clearBeat forgets `current`, not this): the hurdle's way out is read off it. */
  private playedState: FootballAnimState | null = null;
  private playedClip = '';
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
    // STRIDE MATCHING, every frame, on the RUNNING loop (never through play(): the state guard above keeps the tree stable)
    if (input.speedMps !== undefined && STRIDE_STATES.has(c.state)) {
      const want = strideRate(input.speedMps, FOOTBALL_CARRY_PACE_MPS, feel('football.carryStrideMax', FOOTBALL_CARRY_RATE_MAX));
      this.animator.setPlaybackScale?.(c.clip, this.strideFilter.step(want, input.dtSec ?? 1 / 60));
    }
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
    // P5: out of the hurdle onto the carry — its own, longer blend (FOOTBALL_HURDLE_EXIT_FADE_SEC)
    const fadeSec = st === 'carry' && this.playedState === 'stiff_arm' && this.playedClip === FOOTBALL_HURDLE_CLIP
      ? feel('football.hurdleExitFadeSec', FOOTBALL_HURDLE_EXIT_FADE_SEC) : c.fadeSec;
    this.animator.play(c.clip, onEnd ? { loop: c.loop, fadeSec, onEnd } : { loop: c.loop, fadeSec });
    this.current = st; this.playedState = st; this.playedClip = c.clip;
  }
  /** The mode's beat window closed (or a NEW beat of the same kind landed): forget it so the next update re-chooses. */
  clearBeat(...states: FootballAnimState[]): void {
    if (this.current && states.includes(this.current)) this.current = null;
    if (this.spent && states.includes(this.spent)) this.spent = null;
  }
  reset(): void { this.current = null; this.spent = null; this.lastInput = null; this.playedState = null; this.playedClip = ''; }
}

const EMPTY_INPUT: FootballAnimInput = {
  presnap: true, snapped: false, isQB: false, droppingBack: false, throwing: false,
  runningRoute: false, carrying: false, move: null, catching: 'none',
  beingTackled: false, blocking: false, rushing: false,
};
