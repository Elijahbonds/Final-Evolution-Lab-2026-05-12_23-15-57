// DefenseStance — a defender guards his man in a REAL stance, not a kneel (lane/h3-aware, owner decision 2026-10-24: port PR #313's H3c).
//
// The CMU 78 defensive captures under the stance (bball_defend_stance: the tree's defend_idle and box_out) sit the hips 0.63–0.68 m up on
// these bodies, ~40 cm under standing (1.04–1.07 m): thighs past parallel, the trailing knee near the floor — the reels' "kneeling"
// defenders, waiting (#313). A defender's stance is ~20–25 cm down. So the STANDING states are raised DEFENSE_RAISE_M, the legs re-solved
// under the hips so the feet stay where the capture put them (anim/LandingAbsorb's hold, negative; never past RAISE_REACH of a leg's
// length, so the knee keeps a bend). The slides and the backpedal keep their depth: raised, a moving slide's trailing leg swung through
// its push (#313 measured thigh pops to 4,800°/s), so only the standing states rise.
//
// With straighter knees the posture table's defend / slide lean (10° / 8° forward, Spine1 8°) read as a man bent over at the waist, so
// with the stance on those two windows sit the chest up: lean DEFEND_LEAN_DEG, Spine1 DEFEND_SPINE1_DEG (#313: 10 / 8 → −6, 8 → 2).
// The table itself (core/HoopsPosture) is untouched — 1v1 and every other reader keep it; the 3v3 feed swaps the pose here.
// Every number is a feel knob (group "Hoops · 3v3 awareness"); DEFENSE_STANCE_ON 0 = release exactly.
import { feel } from '../../feel-panel/feel';
import type { PosturePose } from './DunkPosture';

/** The stance on (1) / off (0). Off: no raise, the table's lean — release exactly. TUNED (new). */
export const DEFENSE_STANCE_ON = 1;
/** How far the standing defensive captures are raised (m). TUNED (new; #313 DEFENSE_RAISE_M 0.15). */
export const DEFENSE_RAISE_M = 0.15;
/** A raise stops where a leg (hip to ankle) would pass this share of its length — the knee keeps a bend. TUNED (new; #313 RAISE_REACH). */
export const RAISE_REACH = 0.97;
/** How fast the raise eases in and out (s). TUNED (new; #313/H3b's HOLD_SEC 0.18). */
export const STANCE_EASE_SEC = 0.18;
/** The defend / slide windows' lumbar lean with the stance on (deg, + forward). TUNED: 10 (defend) / 8 (slide) → −6 (#313). */
export const DEFEND_LEAN_DEG = -6;
/** The defend / slide windows' Spine1 pitch with the stance on (deg). TUNED: 8 → 2 (#313). */
export const DEFEND_SPINE1_DEG = 2;

/** The tree states on the deep CMU stance capture that STAND (the slides and the backpedal keep their depth). */
export const DEEP_DEFENSE_STATES: ReadonlySet<string> = new Set(['defend_idle', 'box_out']);

export const defenseStanceOn = (): boolean => feel('hoops.defenseStanceOn', DEFENSE_STANCE_ON) >= 0.5;

/** The hold (m) a body's stance asks of anim/LandingAbsorb this frame: −raise on a standing defensive capture, else 0. */
export function stanceHold(state: string | null | undefined): number {
  if (!state || !DEEP_DEFENSE_STATES.has(state) || !defenseStanceOn()) return 0;
  return -Math.max(0, feel('hoops.defenseRaiseM', DEFENSE_RAISE_M));
}
/** The hold's options this frame (the reach cap and the ease). */
export function stanceHoldOpts(): { reach: number; easeSec: number } {
  return { reach: feel('hoops.raiseReach', RAISE_REACH), easeSec: feel('hoops.stanceEaseSec', STANCE_EASE_SEC) };
}

const memo = new Map<PosturePose, { lean: number; s1: number; out: PosturePose }>();
/** The posture pose for a hoops window with the stance's chest: the defend / slide windows sit up; any other window (or the stance
 *  off) is the table's pose unchanged. Allocation-free once warm (one copy per table pose and value pair). */
export function stancePose(window: string, pose: PosturePose): PosturePose {
  if ((window !== 'defend' && window !== 'slide') || !defenseStanceOn()) return pose;
  const lean = feel('hoops.defendLeanDeg', DEFEND_LEAN_DEG), s1 = feel('hoops.defendSpine1Deg', DEFEND_SPINE1_DEG);
  const m = memo.get(pose);
  if (m && m.lean === lean && m.s1 === s1) return m.out;
  const out: PosturePose = { ...pose, lean, spine1: [s1, pose.spine1[1], pose.spine1[2]] };
  memo.set(pose, { lean, s1, out });
  return out;
}
