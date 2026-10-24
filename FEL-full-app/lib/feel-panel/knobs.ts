/**
 * lib/feel-panel/knobs.ts — THE FEEL KNOB CATALOGUE (feel-panel lane, owner 2026-10-20: "dev-only sliders for the new numbers. The owner
 * tweaks them on a phone and tells us the values, and we commit them").
 *
 * One row per number the owner can tune from the feel panel. A row is DATA only: the number itself still lives in its own module as
 * a constant (the default everyone plays), and that module reads it each frame through `feel(id, CONSTANT)` (lib/feel-panel/feel.ts),
 * which returns the constant unless this device holds an override AND the panel is open for this user AND the run is an unpaid
 * playtest (lib/feel-panel/sessionGate.ts). How another lane registers a knob: docs/FEEL-PANEL.md.
 *
 * `def` must equal the constant in `source` (knobs.test.ts pins each one), so the panel's "default" is the number that ships.
 * `min` / `max` are the SAFE bounds: no slider, and no hand-edited localStorage, can move a knob outside them (feel.ts clamps on
 * load and on every set). Pure: no DOM, no Babylon.
 */

export interface FeelKnob {
  /** `<area>.<camelName>`, e.g. 'hoops.aiHandRangeM'. The key in localStorage and in the copied JSON. */
  id: string;
  /** What the owner reads on the panel. */
  label: string;
  /** The shipped value: the constant named in `source`. */
  def: number;
  min: number;
  max: number;
  /** The slider's step; values are rounded to it. */
  step: number;
  /** 'm', 's', '' … shown after the value. */
  unit: string;
  /** Panel section. */
  group: string;
  /** Where the constant lives, so a copied value can be committed: 'lib/babylon/core/AiBallHand.ts AI_HAND_RANGE_M'. */
  source: string;
  /** One line: what moving it does. */
  hint: string;
}

/**
 * The catalogue. APPEND rows for a new knob (other lanes: add yours at the end of your group; a merge then only ever adds lines).
 * Bounds are assumptions until the owner has felt them (flagged in the lane report).
 */
export const FEEL_KNOBS: readonly FeelKnob[] = [
  // ── hoops-handle (#375): the 3v3 AI handlers' ball hand, and the hand clearing the ball ──
  {
    id: 'hoops.aiHandRangeM', label: 'AI hand: defender range', def: 2.4, min: 1.0, max: 4.0, step: 0.05, unit: 'm', group: 'Hoops · ball hand',
    source: 'lib/babylon/core/AiBallHand.ts AI_HAND_RANGE_M',
    hint: 'A defender inside this decides which hand the 3v3 AI handler keeps the ball in.',
  },
  {
    id: 'hoops.aiHandDwellSec', label: 'AI hand: dwell before crossing', def: 0.35, min: 0.05, max: 1.5, step: 0.01, unit: 's', group: 'Hoops · ball hand',
    source: 'lib/babylon/core/AiBallHand.ts AI_HAND_DWELL_SEC',
    hint: 'How long the defender sits on the ball side before the AI handler crosses away from him.',
  },
  {
    id: 'hoops.aiHandGapSec', label: 'AI hand: gap between crossings', def: 0.9, min: 0.2, max: 3.0, step: 0.05, unit: 's', group: 'Hoops · ball hand',
    source: 'lib/babylon/core/AiBallHand.ts AI_HAND_GAP_SEC',
    hint: 'No two AI crossings closer together than this.',
  },
  {
    id: 'hoops.handClearM', label: 'Hand clears the ball by', def: 0.01, min: 0, max: 0.05, step: 0.001, unit: 'm', group: 'Hoops · ball hand',
    source: 'lib/babylon/anim/Dribble.ts HAND_CLEAR_M',
    hint: 'How far above the rising ball the dribble hand is held (no hand through the ball).',
  },
  // ── hoops-shot-core: the distance-narrowed green, ELITE's shot clock, a missed dunk off the iron ──
  {
    id: 'hoops.distGreenNearM', label: 'Green: full width inside', def: 2.0, min: 0.5, max: 5.0, step: 0.1, unit: 'm', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotWindow.ts DIST_GREEN_NEAR_M',
    hint: 'A 1v1 / 3v3 jump shot from inside this keeps the whole green.',
  },
  {
    id: 'hoops.distGreenFarM', label: 'Green: narrowest from', def: 7.5, min: 4.0, max: 10.0, step: 0.1, unit: 'm', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotWindow.ts DIST_GREEN_FAR_M',
    hint: 'From this far out the jump shot\'s green is at its narrowest.',
  },
  {
    id: 'hoops.distGreenMaxNarrow', label: 'Green: most it narrows', def: 0.22, min: 0, max: 0.5, step: 0.01, unit: '', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotWindow.ts DIST_GREEN_MAX_NARROW',
    hint: 'Share of the green taken away at the far distance (0.22 = 22 % narrower, the shootout\'s deepest rack).',
  },
  {
    id: 'hoops.shotClock1v1Sec', label: 'Shot clock 1v1 (ELITE)', def: 12, min: 6, max: 24, step: 1, unit: 's', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotClock.ts SHOT_CLOCK_1V1_SEC',
    hint: 'The player\'s shot clock in 1v1 on ELITE (ROOKIE and PRO are untimed).',
  },
  {
    id: 'hoops.shotClock3v3Sec', label: 'Shot clock 3v3 (ELITE)', def: 14, min: 6, max: 24, step: 1, unit: 's', group: 'Hoops · shooting',
    source: 'lib/babylon/core/ShotClock.ts SHOT_CLOCK_3V3_SEC',
    hint: 'The player\'s shot clock in 3v3 on ELITE (ROOKIE and PRO are untimed).',
  },
  {
    id: 'hoops.dunkRingQuality', label: 'Dunk miss: spread', def: 0.7, min: 0.3, max: 1.0, step: 0.05, unit: '', group: 'Hoops · shooting',
    source: 'lib/babylon/core/RimForAll.ts DUNK_RING_QUALITY',
    hint: 'Where a missed dunk catches the iron (higher = misses closer to the rim\'s edge). The make rate does not change.',
  },
  {
    id: 'hoops.dunkShortBias', label: 'Dunk miss: out the front when contested', def: 0.7, min: 0, max: 1.0, step: 0.05, unit: '', group: 'Hoops · shooting',
    source: 'lib/babylon/core/RimForAll.ts DUNK_SHORT_BIAS',
    hint: 'How much a contest pushes a missed dunk off the front iron, back at the dunker.',
  },
  {
    id: 'hoops.dunkClankMinMps', label: 'Dunk miss: slowest bounce', def: 2.4, min: 1.0, max: 4.0, step: 0.1, unit: 'm/s', group: 'Hoops · shooting',
    source: 'lib/babylon/core/RimForAll.ts DUNK_CLANK_MIN_MPS',
    hint: 'A missed dunk caught near the middle leaves the iron at this speed.',
  },
  {
    id: 'hoops.dunkClankSpanMps', label: 'Dunk miss: extra bounce at the edge', def: 1.6, min: 0, max: 3.0, step: 0.1, unit: 'm/s', group: 'Hoops · shooting',
    source: 'lib/babylon/core/RimForAll.ts DUNK_CLANK_SPAN_MPS',
    hint: 'Added to the slowest bounce for a dunk that catches the far edge of the iron.',
  },
  // ── hoops-moves (hoops round 2): the combo window and the player's outside hand when guarded ──
  {
    id: 'hoops.comboOpenK', label: 'Combo: window opens at', def: 0.5, min: 0.2, max: 0.9, step: 0.05, unit: '', group: 'Hoops · handle',
    source: 'lib/babylon/anim/comboFlow.ts COMBO_OPEN_K',
    hint: 'A move pressed past this share of the running one flows into it and counts toward the on-screen combo (flow only, no odds).',
  },
  {
    id: 'hoops.comboGraceSec', label: 'Combo: grace after a move', def: 0.15, min: 0, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · handle',
    source: 'lib/babylon/anim/comboFlow.ts COMBO_GRACE_SEC',
    hint: 'A move pressed this soon after the last one ended still counts as the same combo.',
  },
  {
    id: 'hoops.guardRangeM', label: 'Outside hand: guarded inside', def: 2.0, min: 0.8, max: 3.5, step: 0.05, unit: 'm', group: 'Hoops · handle',
    source: 'lib/babylon/core/GuardHand.ts GUARD_RANGE_M',
    hint: 'A live defender inside this moves your ball to the hand away from him (after the AI hand\'s dwell); outside it the hand stays put.',
    },
  // ── hoops-defense-fx: the on-ball defender shades the ball side; a cross thrown at him buys a beat (core/BallSideShade) ──
  {
    id: 'hoops.ballSideShadeOn', label: 'Ball-side shade on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/core/BallSideShade.ts BALL_SIDE_SHADE_ON',
    hint: 'A/B: 0 puts the on-ball defender back on the old anchor (the ball itself), exactly as before the shade.',
  },
  {
    id: 'hoops.shadeOffsetM', label: 'Shade: how far to the ball side', def: 0.5, min: 0, max: 1.2, step: 0.05, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/core/BallSideShade.ts SHADE_OFFSET_M',
    hint: 'How far across the handler-to-rim line the on-ball defender sits toward the ball\'s side.',
  },
  {
    id: 'hoops.shadeHoldSec', label: 'Shade: hold after a cross', def: 0.22, min: 0, max: 0.6, step: 0.01, unit: 's', group: 'Hoops · defense',
    source: 'lib/babylon/core/BallSideShade.ts SHADE_REACT_SEC',
    hint: 'The beat: how long he stays on the old side after a cross thrown at him (the lane is open meanwhile).',
  },
  {
    id: 'hoops.shadeSlideMps', label: 'Shade: re-shift rate', def: 2.4, min: 0.5, max: 6.0, step: 0.1, unit: 'm/s', group: 'Hoops · defense',
    source: 'lib/babylon/core/BallSideShade.ts SHADE_SHIFT_MPS',
    hint: 'How fast his spot slides across to the new ball side once he goes (his feet keep their own accel and brake).',
  },
  {
    id: 'hoops.shadeDeadBandM', label: 'Shade: dead band', def: 0.08, min: 0, max: 0.3, step: 0.01, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/core/BallSideShade.ts SHADE_FLIP_M',
    hint: 'The ball must be this far over the line before he reads the other side (the dribble\'s sway never flips him).',
  },
  {
    id: 'hoops.shadeRangeM', label: 'Shade: cross range for the beat', def: 2.4, min: 0.5, max: 4.0, step: 0.05, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/core/BallSideShade.ts SHADE_RANGE_M',
    hint: 'Only a cross thrown inside this of him buys the hold; from further out he just goes.',
  },
  {
    id: 'hoops.shadeReseedM', label: 'Shade: fresh look after a jump of', def: 1.0, min: 0.3, max: 3.0, step: 0.05, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/core/BallSideShade.ts SHADE_RESEED_M',
    hint: 'A handler who moved this far between two reads (a check, a switch) is a new look: no beat, he is simply on the ball side.',
  },
  // lane/h3-aware (owner 2026-10-24: #313 / #315 ported): TUNED (new) unless the hint names a release value
  {
    id: 'hoops.offBallLookOn', label: 'Off-ball look on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/OffBallLook.ts OFF_BALL_LOOK_ON',
    hint: 'A/B: 0 is the release feed (the offence off the ball looks at the rim, every defender\'s chest on the job).',
  },
  {
    id: 'hoops.manGlanceEverySec', label: 'Off-ball D: a glance at his man every', def: 1.6, min: 0.4, max: 4, step: 0.1, unit: 's', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/OffBallLook.ts MAN_GLANCE_EVERY_SEC',
    hint: 'An off-ball defender watches the ball and checks his man this often.',
  },
  {
    id: 'hoops.manGlanceSec', label: 'Off-ball D: the glance lasts', def: 0.4, min: 0, max: 1.2, step: 0.05, unit: 's', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/OffBallLook.ts MAN_GLANCE_SEC',
    hint: 'How long the eyes stay on the man before they go back to the ball (0: never).',
  },
  {
    id: 'hoops.possessionSwapOn', label: 'Their ball: roles swap on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/PossessionSwap.ts POSSESSION_SWAP_ON',
    hint: 'A/B: 0 is release (my teammates run their offence on D; their men off the ball stand in the paint).',
  },
  {
    id: 'hoops.foeSpaceAngleK', label: 'Their ball: wing angle of their spacers', def: 0.3, min: 0, max: 0.5, step: 0.05, unit: '×π', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/PossessionSwap.ts FOE_SPACE_ANGLE_K',
    hint: 'Their men off the ball hold the wings at ± this share of π from the top (0: all at the top).',
  },
  {
    id: 'hoops.hasBallM', label: 'D: his man has the ball inside', def: 1.0, min: 0.6, max: 2.0, step: 0.1, unit: 'm', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/PossessionSwap.ts HAS_BALL_M',
    hint: 'Release 1.8: a screener beside the handler read as the handler and two defenders went to the ball.',
  },
  {
    id: 'hoops.defenseStanceOn', label: 'D stance raised on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/DefenseStance.ts DEFENSE_STANCE_ON',
    hint: 'A/B: 0 is release (the deep capture\'s near-kneel, the table\'s forward lean).',
  },
  {
    id: 'hoops.defenseRaiseM', label: 'D stance: hips raised by', def: 0.15, min: 0, max: 0.25, step: 0.01, unit: 'm', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/DefenseStance.ts DEFENSE_RAISE_M',
    hint: 'The standing stance and the box-out sit this much taller; the feet stay put.',
  },
  {
    id: 'hoops.raiseReach', label: 'D stance: leg reach cap', def: 0.97, min: 0.85, max: 1.0, step: 0.01, unit: '', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/DefenseStance.ts RAISE_REACH',
    hint: 'The raise stops where a leg would pass this share of its length (the knee keeps a bend).',
  },
  {
    id: 'hoops.stanceEaseSec', label: 'D stance: ease in / out', def: 0.18, min: 0.05, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/DefenseStance.ts STANCE_EASE_SEC',
    hint: 'How fast the raise comes on and goes off between the stance and a slide.',
  },
  {
    id: 'hoops.defendLeanDeg', label: 'D stance: lower-back lean', def: -6, min: -15, max: 15, step: 1, unit: '°', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/DefenseStance.ts DEFEND_LEAN_DEG',
    hint: 'The defend / slide windows\' lean with the stance on (release 10 / 8: + bends forward).',
  },
  {
    id: 'hoops.defendSpine1Deg', label: 'D stance: mid-back pitch', def: 2, min: -10, max: 12, step: 1, unit: '°', group: 'Hoops · 3v3 awareness',
    source: 'lib/babylon/core/DefenseStance.ts DEFEND_SPINE1_DEG',
    hint: 'The defend / slide windows\' Spine1 with the stance on (release 8).',
  },
  // lane/h3-aware (#315 H3e): my teammate with the ball — TUNED (new)
  {
    id: 'hoops.mateReadOn', label: 'Teammate reads with the ball on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · teammate',
    source: 'lib/babylon/modes/threevthreeMate.ts MATE_READ_ON',
    hint: 'A/B: 0 is release (he dribbles until you call for it; a 1 %-a-frame shot inside 3.5 m of the ring).',
  },
  {
    id: 'hoops.mateSettleSec', label: 'Teammate: a beat after the catch', def: 0.35, min: 0, max: 1, step: 0.05, unit: 's', group: 'Hoops · teammate',
    source: 'lib/babylon/modes/threevthreeMate.ts MATE_SETTLE_SEC',
    hint: 'He catches it before any read.',
  },
  {
    id: 'hoops.mateReadSec', label: 'Teammate: swing it on after', def: 0.9, min: 0.3, max: 2.5, step: 0.05, unit: 's', group: 'Hoops · teammate',
    source: 'lib/babylon/modes/threevthreeMate.ts MATE_READ_SEC',
    hint: 'With nothing on, he moves it to the open man (you first) this long after the catch.',
  },
  {
    id: 'hoops.mateHoldMaxSec', label: 'Teammate: holds it at most', def: 1.8, min: 0.6, max: 4, step: 0.1, unit: 's', group: 'Hoops · teammate',
    source: 'lib/babylon/modes/threevthreeMate.ts MATE_HOLD_MAX_SEC',
    hint: 'Then a look in range, else the swing.',
  },
  {
    id: 'hoops.mateShootRangeM', label: 'Teammate: shoots off the catch inside', def: 7.3, min: 3, max: 9, step: 0.1, unit: 'm', group: 'Hoops · teammate',
    source: 'lib/babylon/modes/threevthreeMate.ts MATE_SHOOT_RANGE_M',
    hint: 'Open (2.4 m from his nearest man) and inside this of the rim: the shot. The make rate is the ring\'s, unchanged.',
  },
  {
    id: 'hoops.mateDriveFromM', label: 'Teammate: drives a clear lane from', def: 8.5, min: 3, max: 11, step: 0.1, unit: 'm', group: 'Hoops · teammate',
    source: 'lib/babylon/modes/threevthreeMate.ts MATE_DRIVE_FROM_M',
    hint: 'Nobody on his line to the rim and inside this: he puts it on the floor.',
  },
  {
    id: 'hoops.mateFinishM', label: 'Teammate: finishes the drive at', def: 2.4, min: 1, max: 4, step: 0.1, unit: 'm', group: 'Hoops · teammate',
    source: 'lib/babylon/modes/threevthreeMate.ts MATE_FINISH_M',
    hint: 'The drive\'s shot goes up this close to the rim.',
  },
  {
    id: 'hoops.mateDriveMaxSec', label: 'Teammate: drive lasts at most', def: 1.6, min: 0.5, max: 3, step: 0.1, unit: 's', group: 'Hoops · teammate',
    source: 'lib/babylon/modes/threevthreeMate.ts MATE_DRIVE_MAX_SEC',
    hint: 'A drive that has not got there by now pulls up.',
  },
  {
    id: 'hoops.mateLaneM', label: 'Teammate: a clear lane is', def: 0.9, min: 0.3, max: 1.5, step: 0.05, unit: 'm', group: 'Hoops · teammate',
    source: 'lib/babylon/modes/threevthreeMate.ts MATE_LANE_M',
    hint: 'No defender within this of his line to the rim.',
  },
  // ── lane/hoops-def-tell (#273 T-A): the AI reach shows a tell before it resolves; the poke reads the ball (core/ReachTell) ──
  {
    id: 'hoops.aiReachTellOn', label: 'AI reach tell on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts AI_REACH_TELL_ON',
    hint: 'A/B: 0 puts the AI reach back exactly as before #273 (1v1: the steal intent in range is the strip, one roll; 3v3: the reach rolls on the frame it starts).',
  },
  {
    id: 'hoops.aiReachTellSec', label: 'AI reach: tell before it resolves', def: 0.25, min: 0, max: 0.6, step: 0.01, unit: 's', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts AI_REACH_TELL_SEC',
    hint: 'How long the AI reach shows (the reach beat) before it resolves: move the ball inside it and it misses.',
  },
  {
    id: 'hoops.aiReachStunSec', label: 'AI reach: stun after a miss', def: 0.35, min: 0, max: 1.0, step: 0.01, unit: 's', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts AI_REACH_STUN_SEC',
    hint: 'How long a defender whose reach missed is stuck (the lane his miss opens).',
  },
  {
    id: 'hoops.aiReachGate', label: 'AI reach: intent becomes a reach', def: 0.5, min: 0, max: 1, step: 0.01, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts AI_REACH_GATE',
    hint: 'Odds: the share of the AI\'s steal intents in range that become a reach (one reach per 1.2 s at most).',
  },
  {
    id: 'hoops.aiStealChance', label: 'AI reach: strip odds', def: 0.22, min: 0, max: 1, step: 0.01, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts AI_STEAL_CHANCE',
    hint: 'Odds: a reach the handler did not beat takes the ball this often.',
  },
  {
    id: 'hoops.aiStealOnBump', label: 'AI reach: strip odds on the bump', def: 0.6, min: 0, max: 1, step: 0.01, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts AI_STEAL_ON_BUMP',
    hint: 'Odds: the same, when the reach started inside the bump window (the ball out of the hand after body contact).',
  },
  {
    id: 'hoops.pokeReadOn', label: 'Poke reads the ball on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts POKE_READ_ON',
    hint: 'A/B: 0 puts the poke intent back exactly as before #273 (2 % × aggression a frame, inside 1.1 m of the defender\'s spot).',
  },
  {
    id: 'hoops.stealRatePerSec', label: 'Poke: intents per second × aggression', def: 1.2, min: 0, max: 4, step: 0.05, unit: '/s', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts STEAL_RATE_PER_SEC',
    hint: 'How often the on-ball AI wants the ball while it is in reach (the same at any frame rate).',
  },
  {
    id: 'hoops.pokeRangeM', label: 'Poke: reach to the ball', def: 1.2, min: 0.8, max: 2.0, step: 0.05, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts POKE_RANGE',
    hint: 'The ball (led by the handler\'s speed) must be inside this of the defender for a poke.',
  },
  {
    id: 'hoops.pokeLeadSec', label: 'Poke: lead on a moving ball', def: 0.1, min: 0, max: 0.4, step: 0.01, unit: 's', group: 'Hoops · defense',
    source: 'lib/babylon/core/ReachTell.ts POKE_LEAD_SEC',
    hint: 'The poke aims this far ahead of a moving ball (0 = at the ball).',
  },
  // ── lane/hoops-def-tell (#273 T-C): two bodies never stand inside each other, and never pop apart (core/BodySeparation) ──
  {
    id: 'hoops.bodySepOn', label: 'Body separation on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/core/BodySeparation.ts BODY_SEP_ON',
    hint: 'A/B: 0 puts body contact back exactly as before #273 (1v1: the 0.38 capsule and the instant push; 3v3: the instant push). The 1v1 capsule is read when the mode loads: restart the run after changing it.',
  },
  {
    id: 'hoops.capsuleRadius1v1M', label: '1v1 body radius', def: 0.55, min: 0.3, max: 0.7, step: 0.01, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/core/BodySeparation.ts ONEVONE_CAPSULE_RADIUS',
    hint: 'Each 1v1 body\'s physics radius (× 2 = the closest the bodies stand). Read when the mode loads: restart the run after changing it.',
  },
  {
    id: 'hoops.bodyHardGapM', label: 'Separation: hard floor', def: 0.9, min: 0.6, max: 1.1, step: 0.01, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/core/BodySeparation.ts BODY_HARD_GAP',
    hint: 'Below this the bodies are put back to it at once (capped by the pop below); above it they ease apart.',
  },
  {
    id: 'hoops.sepPushMps', label: 'Separation: ease-apart speed', def: 2.4, min: 0.5, max: 6.0, step: 0.1, unit: 'm/s', group: 'Hoops · defense',
    source: 'lib/babylon/core/BodySeparation.ts SEP_PUSH_MPS',
    hint: 'How fast two touching bodies ease back to arm\'s length (per body).',
  },
  {
    id: 'hoops.sepDeadbandM', label: 'Separation: dead band', def: 0.01, min: 0, max: 0.1, step: 0.005, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/core/BodySeparation.ts SEP_DEADBAND',
    hint: 'No correction this close to the 1.10 m standoff (stops chatter).',
  },
  {
    id: 'hoops.sepPopMaxM', label: 'Separation: most in one frame', def: 0.1, min: 0.02, max: 0.3, step: 0.01, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/core/BodySeparation.ts SEP_POP_MAX',
    hint: 'The most separation moves a body in one frame, even from deep overlap.',
  },
  // ── lane/hoops-def-tell (#274 BLK-1): the block selector (core/HoopsBlocks). NOT IN PLAY until BLK-2 wires it (waits on T-B) ──
  {
    id: 'hoops.blkContestTMs', label: 'Block window: contest centre', def: -150, min: -300, max: 300, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_CONTEST_T_MS',
    hint: 'Not in play yet (BLK-2). Centre of any press window, ms against the release (− = before it).',
  },
  {
    id: 'hoops.blkContestHalfMs', label: 'Block window: contest half-width', def: 300, min: 10, max: 400, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_CONTEST_HALF_MS',
    hint: 'Not in play yet (BLK-2). Half the width of any press window (edges count as inside).',
  },
  {
    id: 'hoops.blkSwatTMs', label: 'Block window: swat centre', def: -120, min: -300, max: 300, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_SWAT_T_MS',
    hint: 'Not in play yet (BLK-2). Centre of the swat window, ms against the release (− = before it).',
  },
  {
    id: 'hoops.blkSwatHalfMs', label: 'Block window: swat half-width', def: 120, min: 10, max: 400, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_SWAT_HALF_MS',
    hint: 'Not in play yet (BLK-2). Half the width of the swat window (edges count as inside).',
  },
  {
    id: 'hoops.blkSpikeTMs', label: 'Block window: spike centre', def: -60, min: -300, max: 300, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_SPIKE_T_MS',
    hint: 'Not in play yet (BLK-2). Centre of the spike window, ms against the release (− = before it).',
  },
  {
    id: 'hoops.blkSpikeHalfMs', label: 'Block window: spike half-width', def: 80, min: 10, max: 400, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_SPIKE_HALF_MS',
    hint: 'Not in play yet (BLK-2). Half the width of the spike window (edges count as inside).',
  },
  {
    id: 'hoops.blkChaseTMs', label: 'Block window: chase centre', def: 40, min: -300, max: 300, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_CHASE_T_MS',
    hint: 'Not in play yet (BLK-2). Centre of the chase-down window, ms against the release (− = before it).',
  },
  {
    id: 'hoops.blkChaseHalfMs', label: 'Block window: chase half-width', def: 70, min: 10, max: 400, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_CHASE_HALF_MS',
    hint: 'Not in play yet (BLK-2). Half the width of the chase-down window (edges count as inside).',
  },
  {
    id: 'hoops.blkPinTMs', label: 'Block window: pin centre', def: 120, min: -300, max: 300, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_PIN_T_MS',
    hint: 'Not in play yet (BLK-2). Centre of the pin window, ms against the release (− = before it).',
  },
  {
    id: 'hoops.blkPinHalfMs', label: 'Block window: pin half-width', def: 60, min: 10, max: 400, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_PIN_HALF_MS',
    hint: 'Not in play yet (BLK-2). Half the width of the pin window (edges count as inside).',
  },
  {
    id: 'hoops.blkCatchTMs', label: 'Block window: catch centre', def: -40, min: -300, max: 300, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_CATCH_T_MS',
    hint: 'Not in play yet (BLK-2). Centre of the catch window, ms against the release (− = before it).',
  },
  {
    id: 'hoops.blkCatchHalfMs', label: 'Block window: catch half-width', def: 42, min: 10, max: 400, step: 1, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts BLK_CATCH_HALF_MS',
    hint: 'Not in play yet (BLK-2). Half the width of the catch window (edges count as inside).',
  },
  {
    id: 'hoops.blkHoldMs', label: 'Block: hold to catch', def: 220, min: 50, max: 500, step: 5, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts HOLD_MS',
    hint: 'Not in play yet (BLK-2). A press held at least this long at contact can be a catch.',
  },
  {
    id: 'hoops.blkCatchMeterFullMs', label: 'Block: catch meter full at', def: 320, min: 100, max: 800, step: 5, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts CATCH_METER_FULL_MS',
    hint: 'Not in play yet (BLK-2). The catch meter fills over this much hold.',
  },
  {
    id: 'hoops.blkSwatRangeLayupM', label: 'Block: swat range on a layup', def: 1.5, min: 0.8, max: 2.5, step: 0.05, unit: 'm', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts SWAT_RANGE_LAYUP',
    hint: 'Not in play yet (BLK-2). A swat needs the blocker this close to a layup (today\'s BLOCK_RANGE).',
  },
  {
    id: 'hoops.blkSwatRangeJumperM', label: 'Block: swat range on a jumper', def: 1.2, min: 0.6, max: 2.0, step: 0.05, unit: 'm', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts SWAT_RANGE_JUMPER',
    hint: 'Not in play yet (BLK-2). A swat needs the blocker this close to a jumper.',
  },
  {
    id: 'hoops.blkCatchMaxAngleDeg', label: 'Block: catch, most off square', def: 35, min: 5, max: 90, step: 1, unit: '°', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts CATCH_MAX_ANGLE',
    hint: 'Not in play yet (BLK-2). A catch needs the blocker this square to the shot.',
  },
  {
    id: 'hoops.blkCatchMaxDistM', label: 'Block: catch, furthest', def: 1.1, min: 0.6, max: 2.0, step: 0.05, unit: 'm', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts CATCH_MAX_DIST',
    hint: 'Not in play yet (BLK-2). A catch needs the blocker this close.',
  },
  {
    id: 'hoops.blkSpikeMaxAngleDeg', label: 'Block: spike, most off square', def: 30, min: 5, max: 90, step: 1, unit: '°', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts SPIKE_MAX_ANGLE',
    hint: 'Not in play yet (BLK-2). A spike needs the blocker this square to a rising ball.',
  },
  {
    id: 'hoops.blkPinGlassMaxM', label: 'Block: pin, ball off the glass', def: 0.9, min: 0.2, max: 2.0, step: 0.05, unit: 'm', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts PIN_GLASS_MAX',
    hint: 'Not in play yet (BLK-2). A pin needs the ball this close to the glass.',
  },
  {
    id: 'hoops.blkFoulAngleDeg', label: 'Block foul: wide angle past', def: 60, min: 20, max: 120, step: 1, unit: '°', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts FOUL_BAD_ANGLE_DEG',
    hint: 'Not in play yet (BLK-2). A block from further off square than this, in front, risks the foul below.',
  },
  {
    id: 'hoops.blkFoulAnglePct', label: 'Block foul: odds at a wide angle', def: 0.25, min: 0, max: 1, step: 0.01, unit: '', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts FOUL_BAD_ANGLE_PCT',
    hint: 'Not in play yet (BLK-2). Odds: a wide-angle block is a shooting foul this often.',
  },
  {
    id: 'hoops.blkFoulHardGapPct', label: 'Block foul: odds through the body', def: 0.5, min: 0, max: 1, step: 0.01, unit: '', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts FOUL_HARD_GAP_PCT',
    hint: 'Not in play yet (BLK-2). Odds: a block with the bodies inside the hard floor (0.90 m) is a foul this often.',
  },
  {
    id: 'hoops.blkFoulStandoffPct', label: 'Block foul: odds body on body', def: 0.15, min: 0, max: 1, step: 0.01, unit: '', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts FOUL_STANDOFF_PCT',
    hint: 'Not in play yet (BLK-2). Odds: a block with the bodies inside 1.10 m is a foul this often.',
  },
  {
    id: 'hoops.blkFoulLateMarginMs', label: 'Block foul: late-press margin', def: 100, min: 0, max: 300, step: 5, unit: 'ms', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts FOUL_LATE_MARGIN_MS',
    hint: 'Not in play yet (BLK-2). A press this far past the swat window\'s end (still in the release) is a late press.',
  },
  {
    id: 'hoops.blkFoulLatePct', label: 'Block foul: odds on a late press', def: 0.35, min: 0, max: 1, step: 0.01, unit: '', group: 'Hoops · blocks',
    source: 'lib/babylon/core/HoopsBlocks.ts FOUL_LATE_PCT',
    hint: 'Not in play yet (BLK-2). Odds: a late press that makes contact is a foul this often.',
  },
  // ── hoops-reverse (#311's H3a, ported): the ball handler's stick — every default is the release value (core/HoopsStick) ──
  {
    id: 'hoops.jogTau', label: 'Jog: lag to top speed', def: 0.17, min: 0.05, max: 0.4, step: 0.01, unit: 's', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_JOG_TAU',
    hint: 'How quickly a pushed stick reaches jog speed (lower = snappier). H3a: 0.10.',
  },
  {
    id: 'hoops.sprintTau', label: 'Sprint: lag to top speed', def: 0.15, min: 0.05, max: 0.4, step: 0.01, unit: 's', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_SPRINT_TAU',
    hint: 'How quickly the turbo reaches sprint speed (lower = snappier). H3a: 0.10.',
  },
  {
    id: 'hoops.jogAccel', label: 'Jog: acceleration cap', def: 15, min: 5, max: 40, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_JOG_ACCEL',
    hint: 'The most the handler gains per second toward a jog. H3a: 22.',
  },
  {
    id: 'hoops.sprintAccel', label: 'Sprint: acceleration cap', def: 24, min: 5, max: 40, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_SPRINT_ACCEL',
    hint: 'The most the handler gains per second toward a sprint. H3a: 26.',
  },
  {
    id: 'hoops.loadScale', label: 'First step: load', def: 0.45, min: 0.2, max: 1, step: 0.05, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_LOAD_SCALE',
    hint: 'Share of the acceleration on the first step from a standstill (1 = no loaded step). H3a: 0.7.',
  },
  {
    id: 'hoops.gearDownDecel', label: 'Off the turbo: ease-down', def: 9, min: 3, max: 30, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_GEAR_DOWN_DECEL',
    hint: 'How fast the speed eases down when the turbo is let go with the stick held. H3a: 12.',
  },
  {
    id: 'hoops.stopDecelLow', label: 'Stop: brake from a walk', def: 22, min: 8, max: 60, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_STOP_DECEL_LOW',
    hint: 'The brake when the stick is released at a walk. H3a: 32.',
  },
  {
    id: 'hoops.stopDecelHigh', label: 'Stop: brake from a sprint', def: 11, min: 5, max: 60, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_STOP_DECEL_HIGH',
    hint: 'The brake when the stick is released at top speed (lower = a longer slide). H3a: 26.',
  },
  {
    id: 'hoops.plantDecel', label: 'Plant: bleed on a hard cut', def: 47.6, min: 10, max: 80, step: 0.2, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_PLANT_DECEL',
    hint: 'How hard the plant bleeds speed on a cut of over ~110° at pace. H3a: 34.',
  },
  {
    id: 'hoops.handlerTurnDeg', label: 'Handler: turn rate', def: 540, min: 270, max: 1080, step: 10, unit: '°/s', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_HANDLER_TURN_DEG',
    hint: 'How fast the run of the ball handler turns toward the stick (slower near top speed). H3a: 720.',
  },
  {
    id: 'hoops.turnTrueArc', label: 'Turn: true arc (1) / lerp (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_TURN_TRUE_ARC',
    hint: '1 = a turn rotates at the full turn rate; 0 = the steer as shipped, which turns wide angles slower. H3a: 1.',
  },
  {
    id: 'hoops.kickSec', label: 'Turbo kick: spread over', def: 0, min: 0, max: 0.3, step: 0.01, unit: 's', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_KICK_SEC',
    hint: 'The kick of a turbo press is added over this long (0 = all in one frame, as shipped). H3a: 0.10.',
  },
  {
    id: 'hoops.cutSec', label: 'Cut cost: paid over', def: 0, min: 0, max: 0.3, step: 0.01, unit: 's', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_CUT_SEC',
    hint: 'The speed a cut costs is paid over this long (0 = in one frame, as shipped). H3a: 0.08.',
  },
  {
    id: 'hoops.jerk', label: 'Smoothing: jerk limit', def: 0, min: 0, max: 2000, step: 50, unit: 'm/s³', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_JERK',
    hint: 'The most the acceleration can change per second: no one-frame flip from push to brake (0 = off, as shipped). H3a: 900.',
  },
  {
    id: 'hoops.reverseDeg', label: 'Reversal: from this angle', def: 135, min: 90, max: 180, step: 5, unit: '°', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_REVERSE_DEG',
    hint: 'A stick this far round from the run is a reversal: brake through zero, then go the new way (the fix; 180 = an exact pull-back only).',
  },
  {
    id: 'hoops.reverseDecel', label: 'Reversal: brake', def: 47.6, min: 10, max: 80, step: 0.2, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_REVERSE_DECEL',
    hint: 'How hard a reversal brakes through zero after the plant. H3a: 34.',
  },
  {
    id: 'hoops.retreatSpeedK', label: 'Retreat: share of jog speed', def: 0.7, min: 0.3, max: 1, step: 0.05, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_RETREAT_SPEED_K',
    hint: 'The backpedal (the stick held against the facing) tops out at this share of a jog. Forward runs, sprints and slides never. 1 = no cap.',
  },
  // ── hoops-overtime (NB-3): a 3v3 level at the horn is sudden-death overtime on its own clock (modes/threevthreeOvertime) ──
  {
    id: 'hoops.overtime3v3Sec', label: 'Overtime clock 3v3', def: 30, min: 10, max: 90, step: 5, unit: 's', group: 'Hoops · rules',
    source: 'lib/babylon/modes/threevthreeOvertime.ts OVERTIME_3V3_SEC',
    hint: 'A 3v3 tied at the horn plays sudden death on this clock: the next bucket wins; still level when it runs out, another overtime.',
  },
];

export const FEEL_KNOB_BY_ID: ReadonlyMap<string, FeelKnob> = new Map(FEEL_KNOBS.map((k) => [k.id, k]));

/** Decimal places of a step (0.05 → 2, 0.001 → 3, 1 → 0). */
export function stepDecimals(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** A value made safe for a knob: finite, inside [min, max], on the step grid. null for anything that is not a finite number. */
export function clampKnob(k: FeelKnob, v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const c = Math.min(k.max, Math.max(k.min, v));
  const onGrid = k.min + Math.round((c - k.min) / k.step) * k.step;
  return Number(Math.min(k.max, Math.max(k.min, onGrid)).toFixed(stepDecimals(k.step)));
}
