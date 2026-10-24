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
  // lane/h3-handler (owner 2026-10-24: the #312 / #314 ports): the dribble at rest, the protect, the move ease ("Hoops · handle (rest)")
  // and the jump shot's hop ("Hoops · jump shot"). Defaults are the ported numbers; the 0/1 rows are each feature's A/B.
  {
    id: 'hoops.protectDribbleOn', label: 'Protect plays a dribble on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts PROTECT_DRIBBLE_ON',
    hint: 'A/B (#312): 1 = the protect at rest plays the idle dribble loop; 0 = the defender\'s stance (no ball arm), as before.',
  },
  {
    id: 'hoops.restBounceOn', label: 'Bounce on the clip at rest on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts REST_BOUNCE_ON',
    hint: 'A/B (#312): 1 = the rest tempo and the bounce locked to the clip hand; 0 = the loop at its capture pace, the bounce on its own clock.',
  },
  {
    id: 'hoops.restTempoIdle', label: 'Rest dribble tempo (× capture)', def: 1.2, min: 0.8, max: 1.8, step: 0.05, unit: '×', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts REST_TEMPO_IDLE',
    hint: 'How fast the idle dribble loop plays at rest (1.2 = 1.56 bounces a second).',
  },
  {
    id: 'hoops.restTempoProtect', label: 'Protect dribble tempo (× capture)', def: 1.45, min: 0.8, max: 2, step: 0.05, unit: '×', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts REST_TEMPO_PROTECT',
    hint: 'How fast the dribble plays in the protect: low and hard (1.45 = 1.88 bounces a second).',
  },
  {
    id: 'hoops.clipLockGain', label: 'Clip lock: pull', def: 3, min: 0, max: 6, step: 0.1, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts CLIP_LOCK_GAIN',
    hint: 'How hard the bounce is pulled onto the clip hand\'s tops (0 = it keeps its own clock).',
  },
  {
    id: 'hoops.clipLockHzMax', label: 'Clip lock: fastest bounce', def: 2.6, min: 1.5, max: 3.5, step: 0.05, unit: 'Hz', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts CLIP_LOCK_HZ_MAX',
    hint: 'The locked bounce never runs faster than this.',
  },
  {
    id: 'hoops.clipLockMaxMps', label: 'Clip lock: at rest under', def: 0.4, min: 0.1, max: 1, step: 0.05, unit: 'm/s', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts CLIP_LOCK_MAX_MPS',
    hint: 'The clip lock runs while the body moves slower than this.',
  },
  {
    id: 'hoops.eyesOnDefenderOn', label: 'Eyes on the defender on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/core/HoopsLook.ts EYES_ON_DEFENDER_ON',
    hint: 'A/B (#312): 1 = sizing him up, the eyes go to his chest (a glance at the rim now and then); 0 = the rim, as before.',
  },
  {
    id: 'hoops.readRangeM', label: 'Eyes: read a defender within', def: 3.5, min: 1.5, max: 6, step: 0.05, unit: 'm', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/core/HoopsLook.ts READ_RANGE_M',
    hint: 'A defender inside this (and between you and the rim) is read.',
  },
  {
    id: 'hoops.readSpeed01', label: 'Eyes: read at speed up to', def: 0.42, min: 0.1, max: 0.8, step: 0.01, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/core/HoopsLook.ts READ_SPEED01',
    hint: 'Moving faster than this (share of top speed) the eyes stay on the rim.',
  },
  {
    id: 'hoops.readGlanceEverySec', label: 'Eyes: rim glance every', def: 2.4, min: 0.8, max: 6, step: 0.1, unit: 's', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/core/HoopsLook.ts READ_GLANCE_EVERY_SEC',
    hint: 'How often the eyes flick to the rim while sizing him up.',
  },
  {
    id: 'hoops.readGlanceSec', label: 'Eyes: rim glance lasts', def: 0.55, min: 0, max: 1.5, step: 0.05, unit: 's', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/core/HoopsLook.ts READ_GLANCE_SEC',
    hint: 'How long that glance lasts (0 = never glances).',
  },
  {
    id: 'hoops.protectGuardOn', label: 'Protect guard on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts PROTECT_GUARD_ON',
    hint: 'A/B (#312): 1 = in the protect the bounce goes back by the hip and the off forearm comes across as a bar; 0 = as before.',
  },
  {
    id: 'hoops.guardBackM', label: 'Guard: bounce back by', def: 0.22, min: 0, max: 0.4, step: 0.01, unit: 'm', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts GUARD_BACK_M',
    hint: 'How far back beside the hip the protect\'s bounce goes.',
  },
  {
    id: 'hoops.guardOutM', label: 'Guard: bounce wider by', def: 0.06, min: 0, max: 0.2, step: 0.01, unit: 'm', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts GUARD_OUT_M',
    hint: 'How much wider the protect\'s bounce goes.',
  },
  {
    id: 'hoops.guardDropM', label: 'Guard: palm lower by', def: 0.06, min: 0, max: 0.15, step: 0.01, unit: 'm', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts GUARD_DROP_M',
    hint: 'How much lower the palm meets the ball in the protect.',
  },
  {
    id: 'hoops.guardSec', label: 'Guard: ease', def: 0.15, min: 0.02, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts GUARD_SEC',
    hint: 'How fast the guard comes on and goes off.',
  },
  {
    id: 'hoops.guardBarXM', label: 'Guard bar: across', def: 0.15, min: -0.1, max: 0.4, step: 0.01, unit: 'm', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts GUARD_BAR_X_M',
    hint: 'Where the off hand sits across the front (toward the ball side).',
  },
  {
    id: 'hoops.guardBarYM', label: 'Guard bar: height', def: 1.06, min: 0.8, max: 1.4, step: 0.01, unit: 'm', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts GUARD_BAR_Y_M',
    hint: 'How high the off hand\'s bar sits.',
  },
  {
    id: 'hoops.guardBarZM', label: 'Guard bar: forward', def: 0.34, min: 0.1, max: 0.6, step: 0.01, unit: 'm', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/RestDribble.ts GUARD_BAR_Z_M',
    hint: 'How far in front of the body the bar sits.',
  },
  {
    id: 'hoops.protectPostureOn', label: 'Protect posture on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/core/HoopsLook.ts PROTECT_POSTURE_ON',
    hint: 'A/B (#312): 1 = in the protect the chest turns side-on, the eyes hold him and the hips sink; 0 = the protect stance as before.',
  },
  {
    id: 'hoops.protectTurnDeg', label: 'Protect: chest turn off him', def: 50, min: 0, max: 80, step: 1, unit: '°', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/core/HoopsLook.ts PROTECT_TURN_DEG',
    hint: 'How far the chest turns off the defender toward the ball (the off shoulder into him).',
  },
  {
    id: 'hoops.protectEyes', label: 'Protect: eyes weight', def: 0.9, min: 0, max: 1, step: 0.05, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/core/HoopsLook.ts PROTECT_EYES',
    hint: 'How hard the head turns to the defender in the protect (was 0.6).',
  },
  {
    id: 'hoops.protectChestAim', label: 'Protect: chest aim weight', def: 0.8, min: 0, max: 1, step: 0.05, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/core/HoopsLook.ts PROTECT_CHEST_AIM',
    hint: 'How much of the side-on turn the chest takes (was 0).',
  },
  {
    id: 'hoops.protectSinkM', label: 'Protect: hips lower by', def: 0.06, min: 0, max: 0.15, step: 0.01, unit: 'm', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/ProtectSink.ts PROTECT_SINK_M',
    hint: 'How much lower the hips sit in the protect (the feet and hands stay put).',
  },
  {
    id: 'hoops.protectSinkSec', label: 'Protect: sink ease', def: 0.18, min: 0.05, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/ProtectSink.ts PROTECT_SINK_SEC',
    hint: 'How fast the protect\'s sink goes in and comes out.',
  },
  {
    id: 'hoops.moveEaseOn', label: 'Move hand-over ease on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/MoveEase.ts MOVE_EASE_ON',
    hint: 'A/B (#314): 1 = an arm cannot whip at a move\'s start or end (no entry pops); 0 = as before.',
  },
  {
    id: 'hoops.moveEaseSec', label: 'Move ease: hand-over window', def: 0.2, min: 0.05, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/MoveEase.ts MOVE_EASE_SEC',
    hint: 'How long the gentle limit holds at a move\'s start and end.',
  },
  {
    id: 'hoops.moveEaseRateDeg', label: 'Move ease: arm limit in the hand-over', def: 1000, min: 300, max: 3000, step: 50, unit: '°/s', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/MoveEase.ts MOVE_EASE_RATE_DEG',
    hint: 'The fastest an arm bone may turn in that window.',
  },
  {
    id: 'hoops.moveArmRateDeg', label: 'Move ease: arm limit mid-move', def: 1800, min: 600, max: 5000, step: 50, unit: '°/s', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/MoveEase.ts MOVE_ARM_RATE_DEG',
    hint: 'The fastest an arm bone may turn through the rest of a move.',
  },
  {
    id: 'hoops.jumperHopOn', label: 'Jumper hop timed to the release on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · jump shot',
    source: 'lib/babylon/core/JumperHop.ts JUMPER_HOP_ON',
    hint: 'A/B (#314, TUNED): 1 = the load on the floor, the apex at the release, ~0.5 s in the air; 0 = the old float (~0.9-1.0 s). Never moves the release timing.',
  },
  {
    id: 'hoops.jumperApexAfterReleaseSec', label: 'Jumper: apex after the release', def: 0.03, min: -0.1, max: 0.15, step: 0.01, unit: 's', group: 'Hoops · jump shot',
    source: 'lib/babylon/core/JumperHop.ts JUMPER_APEX_AFTER_RELEASE_SEC',
    hint: 'The top of the jump lands this long after the ball leaves (the body only; the release timing never moves).',
  },
  {
    id: 'hoops.jumperMinLoadSec', label: 'Jumper: least load on the floor', def: 0.08, min: 0, max: 0.25, step: 0.01, unit: 's', group: 'Hoops · jump shot',
    source: 'lib/babylon/core/JumperHop.ts JUMPER_MIN_LOAD_SEC',
    hint: 'The dip before take-off is at least this long.',
  },
  {
    id: 'hoops.jumperHangOn', label: 'Jumper hang on a late release on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · jump shot',
    source: 'lib/babylon/core/JumperHop.ts JUMPER_HANG_ON',
    hint: 'A/B (#314): 1 = held past the release frame, the shot hangs at the set point; 0 = the clip runs on and loops, as before.',
  },
  {
    id: 'hoops.jumperHangScale', label: 'Jumper: hang pace', def: 0.1, min: 0, max: 0.5, step: 0.01, unit: '×', group: 'Hoops · jump shot',
    source: 'lib/babylon/core/JumperHop.ts JUMPER_HANG_SCALE',
    hint: 'How slowly the held shot drifts once it hangs (0 = frozen).',
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
