// hoopsTransitions — ONE blend + minimum-hold rule for every clip change a hoops body's tree makes (1v1 / 3v3 ten-phase pass, phase 4
// "feet and transitions"; owner 2026-10-20: "Animation: blend + minimum-hold rules on every clip change, all sports").
//
// Before this every state carried its own fade (0.06–0.26 s) and the tree's dwell (0.22 s) held only two hand-listed groups of
// loops. A fade is what a pop is made of: a clip change at 0.06–0.12 s turns a thigh through the whole difference between two poses
// in four to seven frames (the rig's pop: a bone at ≥ 600 °/s and 3.5× its neighbours — the hoops-gap analyse, legs first).
//
// THE RULE, per pair (from → to), in one table:
//   · a FADE no shorter than the pair's floor — locomotion to locomotion (the gait loops, the defence loops) blends long, because their
//     legs are out of phase and only time hides that; a loop into a one-shot keeps its own short fade, floored, so a press is never
//     delayed (the clip starts on the press's frame: only how fast its weight comes in changes — phase 1's press-to-beat is the frame
//     the clip STARTS, not the frame it reaches full weight);
//   · a MINIMUM HOLD on a loop before a sibling loop may replace it (the release's dwell, for every loop group now, one number);
//   · the priority states (a floor, a stagger, a dunk) and a mode's beat are never held — only floored.
// Every number is a feel knob (group "Hoops · transitions"). Pure: the tree asks, the animator plays.
import { feel } from '../../feel-panel/feel';

/** 1 = the rule; 0 = each state's own fade and the release's dwell exactly (the A/B). Knob `hoops.transitionRuleOn`. */
export const TRANSITION_RULE_ON = true;
/** Loop ↔ loop in the gait group (the dribbles, the run, the watch, the protect): the fade floor (s). Knob `hoops.gaitFadeSec`. */
export const GAIT_FADE_SEC = 0.22;
/** Loop ↔ loop in the defence group (the slides, the backpedal, the closeout, the crossover step): the fade floor (s). Knob
 *  `hoops.defenseFadeSec`. */
export const DEFENSE_FADE_SEC = 0.2;
/** Across the groups (offence ↔ defence, a loop out of a beat's settle): the fade floor (s). Knob `hoops.crossFadeSec`. */
export const CROSS_FADE_SEC = 0.2;
/** Into a one-shot (a tree crossover, a layup, a celebration) or a mode's beat: the fade floor (s). A press is not delayed by it — the
 *  clip starts on the frame. Knob `hoops.beatFadeFloorSec`. */
export const BEAT_FADE_FLOOR_SEC = 0.1;
/** A priority cut (the floor, a stagger, a dunk): the fade floor (s). Knob `hoops.priorityFadeSec`. */
export const PRIORITY_FADE_SEC = 0.08;
/** A loop is held at least this long before a sibling loop replaces it (s) — the release's 0.22 s dwell, now for every loop group.
 *  Knob `hoops.minHoldSec`. */
export const MIN_HOLD_SEC = 0.22;

export const transitionRuleOn = (): boolean => feel('hoops.transitionRuleOn', TRANSITION_RULE_ON ? 1 : 0) >= 0.5;

/** The loop groups (a sibling loop is held; a change across groups is not, but blends at the cross floor). */
export const GAIT_STATES: ReadonlySet<string> = new Set(['idle_dribble', 'protect', 'speed_dribble', 'walk_dribble', 'sprint_dribble', 'drive', 'run', 'watch', 'carry_slide', 'carry_slide_right', 'carry_back']);
export const DEFENSE_STATES: ReadonlySet<string> = new Set(['defend_idle', 'defend_slide', 'defend_slide_right', 'defend_slide_hard', 'defend_slide_hard_right', 'defend_backpedal', 'closeout', 'box_out', 'defend_run', 'defend_run_right', 'run']);
/** The states that cut whatever is playing (the tree's PRIORITY): never held, floored at PRIORITY_FADE_SEC. */
export const PRIORITY_STATES: ReadonlySet<string> = new Set(['floor', 'contact_stagger', 'dunk']);

export type TransitionKind = 'gait' | 'defense' | 'cross' | 'beat' | 'priority' | 'same';
export interface Transition {
  kind: TransitionKind;
  /** The fade this change plays at (s): the requested one, floored by the pair. */
  fadeSec: number;
  /** How long the running loop must have played before this change may happen (s); 0 = at once. */
  holdSec: number;
}
const sameGroup = (a: string, b: string): boolean => (GAIT_STATES.has(a) && GAIT_STATES.has(b)) || (DEFENSE_STATES.has(a) && DEFENSE_STATES.has(b));

/**
 * THE RULE for one clip change. `from` is the state playing (null: nothing / a beat), `to` the state asked for, `toLoop` whether it is a
 * loop, `requestedFade` the fade the caller asked for. A mode's beat is `to = null` (a clip the tree does not own).
 */
export function transitionFor(from: string | null, to: string | null, toLoop: boolean, requestedFade: number): Transition {
  const req = Math.max(0, requestedFade);
  if (!transitionRuleOn()) return { kind: 'same', fadeSec: req, holdSec: 0 };
  if (to !== null && PRIORITY_STATES.has(to)) return { kind: 'priority', fadeSec: Math.max(req, feel('hoops.priorityFadeSec', PRIORITY_FADE_SEC)), holdSec: 0 };
  if (to === null || !toLoop) return { kind: 'beat', fadeSec: Math.max(req, feel('hoops.beatFadeFloorSec', BEAT_FADE_FLOOR_SEC)), holdSec: 0 };
  if (from === null || from === to) return { kind: 'cross', fadeSec: Math.max(req, feel('hoops.crossFadeSec', CROSS_FADE_SEC)), holdSec: 0 };
  if (sameGroup(from, to)) {
    // ('run' sits in both groups: a pair that is a gait pair blends as gait, otherwise as defence)
    const gait = GAIT_STATES.has(from) && GAIT_STATES.has(to);
    const floor = gait ? feel('hoops.gaitFadeSec', GAIT_FADE_SEC) : feel('hoops.defenseFadeSec', DEFENSE_FADE_SEC);
    return { kind: gait ? 'gait' : 'defense', fadeSec: Math.max(req, floor), holdSec: feel('hoops.minHoldSec', MIN_HOLD_SEC) };
  }
  return { kind: 'cross', fadeSec: Math.max(req, feel('hoops.crossFadeSec', CROSS_FADE_SEC)), holdSec: 0 };
}
