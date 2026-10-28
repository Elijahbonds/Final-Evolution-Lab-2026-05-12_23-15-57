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
    id: 'hoops.aiReachGate', label: 'AI reach: intent becomes a reach', def: 0.7, min: 0, max: 1, step: 0.01, unit: '', group: 'Hoops · defense',
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
  // ── hoops-p02 (1v1/3v3 ten-phase pass, phase 2 "defence is skill, not dice"): blocks, the contest, the AI strip, on-ball pressure ──
  {
    id: 'hoops.blockDiceOn', label: 'Blocks: dice (1) / hand meets ball (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts BLOCK_DICE_ON',
    hint: 'A/B: 1 puts today\'s block rolls back exactly (aiBlockChance, checkBlock\'s window, jumpSwats, goaltending with no touch).',
  },
  {
    id: 'hoops.blkShoulderM', label: 'Blocks: shoulder height', def: 1.55, min: 1.2, max: 1.9, step: 0.01, unit: 'm', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts SHOULDER_M',
    hint: 'The shoulder the reaching arm swings from, standing; it rides the contest jump.',
  },
  {
    id: 'hoops.blkArmM', label: 'Blocks: arm (shoulder to fingertips)', def: 0.85, min: 0.5, max: 1.2, step: 0.01, unit: 'm', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts ARM_M',
    hint: 'How far the hand gets from the shoulder. With the shoulder: the standing reach.',
  },
  {
    id: 'hoops.blkContactM', label: 'Blocks: ball meets hand within', def: 0.14, min: 0.05, max: 0.4, step: 0.01, unit: 'm', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts CONTACT_M',
    hint: 'The ball centre this close to the reach is a touch (the ball radius and a fingertip).',
  },
  {
    id: 'hoops.blkReleaseJumperM', label: 'Blocks: a jumper leaves the hand at', def: 2.6, min: 1.8, max: 3.2, step: 0.01, unit: 'm', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts RELEASE_JUMPER_M',
    hint: 'Above the shooter\'s feet. The block reads the ball from here when the drawn ball is still lower (the release fires before the arms are up).',
  },
  {
    id: 'hoops.blkReleaseLayupM', label: 'Blocks: a layup leaves the hand at', def: 2.5, min: 1.8, max: 3.3, step: 0.01, unit: 'm', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts RELEASE_LAYUP_M',
    hint: 'Above the shooter\'s feet, for a layup / reverse / scoop and the other finishes at the rim.',
  },
  {
    id: 'hoops.blkLookSec', label: 'Blocks: release flight a hand can meet', def: 0.25, min: 0.05, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts LOOK_SEC',
    hint: 'How much of a released shot\'s flight is read for a block.',
  },
  {
    id: 'hoops.aiBlockJumpChance', label: 'AI block: jumps at my gather this often', def: 0.45, min: 0, max: 1, step: 0.01, unit: '', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/core/HoopsDefense.ts AI_BLOCK_JUMP_CHANCE',
    hint: 'In range at my gather, the AI leaves the floor (timed to my release) this often; otherwise a hand up. His choice — the block is his hand on the ball.',
  },
  {
    id: 'hoops.aiBlockReactOn', label: 'AI block: wait out its reaction (1) / jump off the read (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts AI_BLOCK_REACT_ON',
    hint: '1: the AI\'s block jump never leaves before its tier\'s reaction (420 / 220 / 120 ms) after my gather — it then misses quick finishes.',
  },
  {
    id: 'hoops.aiBlockLeadSec', label: 'AI block: leaves the floor before the release', def: 0.25, min: 0, max: 0.6, step: 0.01, unit: 's', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts AI_BLOCK_LEAD_SEC',
    hint: 'The AI times its jump this long before the release it expects (the green). Never before its reaction lets it.',
  },
  {
    id: 'hoops.blkDeflectMps', label: 'Blocks: ball off the hand, speed', def: 2.4, min: 0.5, max: 6, step: 0.1, unit: 'm/s', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts DEFLECT_MPS',
    hint: 'How fast a blocked ball leaves along the line it was hit.',
  },
  {
    id: 'hoops.blkDeflectUpMps', label: 'Blocks: ball off the hand, lift', def: 1.4, min: 0, max: 4, step: 0.1, unit: 'm/s', group: 'Hoops · blocks (hand meets ball)',
    source: 'lib/babylon/hoops/blocks.ts DEFLECT_UP_MPS',
    hint: 'Up off a rising hand (a falling hand spikes it down a little).',
  },
  {
    id: 'hoops.oneContestOn', label: 'Contest: one model (1) / per shooter (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · contest',
    source: 'lib/babylon/hoops/contest.ts ONE_CONTEST_ON',
    hint: 'A/B: 0 puts each shooter\'s old contest formula back exactly.',
  },
  {
    id: 'hoops.contestRangeM', label: 'Contest: distance reaches 0 at', def: 2.6, min: 1.5, max: 4, step: 0.05, unit: 'm', group: 'Hoops · contest',
    source: 'lib/babylon/hoops/contest.ts CONTEST_RANGE_M',
    hint: 'Planar. Today: 2.2 on my jumper, 3.0 on theirs and my mates\'.',
  },
  {
    id: 'hoops.contestDistW', label: 'Contest: distance weight', def: 1, min: 0, max: 1.5, step: 0.05, unit: '', group: 'Hoops · contest',
    source: 'lib/babylon/hoops/contest.ts CONTEST_DIST_W',
    hint: 'How much the distance alone contests.',
  },
  {
    id: 'hoops.contestJump', label: 'Contest: a jump at its top adds', def: 0.32, min: 0, max: 0.6, step: 0.01, unit: '', group: 'Hoops · contest',
    source: 'lib/babylon/hoops/contest.ts JUMP_CONTEST',
    hint: 'Today a flat 0.3 for 0.7 s; now on the jump\'s curve.',
  },
  {
    id: 'hoops.contestJumpFloor', label: 'Contest: share at take-off / landing', def: 0.35, min: 0, max: 1, step: 0.05, unit: '', group: 'Hoops · contest',
    source: 'lib/babylon/hoops/contest.ts JUMP_CONTEST_FLOOR',
    hint: 'Of the jump\'s contest, what a jump just leaving or coming down adds.',
  },
  {
    id: 'hoops.contestCloseout', label: 'Contest: a full closeout adds', def: 0.1, min: 0, max: 0.3, step: 0.01, unit: '', group: 'Hoops · contest',
    source: 'lib/babylon/hoops/contest.ts CLOSEOUT_CONTEST',
    hint: 'A defender running AT the shooter (not past him) adds up to this.',
  },
  {
    id: 'hoops.contestCloseoutFullMps', label: 'Contest: full closeout speed', def: 3, min: 1, max: 6, step: 0.1, unit: 'm/s', group: 'Hoops · contest',
    source: 'lib/babylon/hoops/contest.ts CLOSEOUT_FULL_MPS',
    hint: 'Speed along the line to the shooter for the full closeout.',
  },
  {
    id: 'hoops.stealDiceOn', label: 'AI strip: dice (1) / hand on the ball (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/hoops/steals.ts STEAL_DICE_ON',
    hint: 'A/B: 1 puts today\'s strip rolls back exactly (0.22 a reach, 0.6 on the bump, 0.18 a bump strip).',
  },
  {
    id: 'hoops.stripReachM', label: 'AI strip: hand reaches the ball within', def: 1.2, min: 0.5, max: 1.5, step: 0.01, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/hoops/steals.ts STRIP_REACH_M',
    hint: 'Planar, the reacher to the ball, when his reach resolves.',
  },
  {
    id: 'hoops.stripShieldM', label: 'AI strip: handler body shields within', def: 0.25, min: 0, max: 0.6, step: 0.01, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/hoops/steals.ts STRIP_SHIELD_M',
    hint: 'A ball whose line to the reacher passes this close to the handler is behind his body.',
  },
  {
    id: 'hoops.stripBallMaxY', label: 'AI strip: ball off the palm below', def: 0.85, min: 0.3, max: 1.5, step: 0.01, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/hoops/steals.ts STRIP_BALL_MAX_Y',
    hint: 'Above this the ball is held at the top of the dribble (the bump window ignores it).',
  },
  {
    id: 'hoops.onBallCushionM', label: 'On-ball: most room on a moving handler', def: 1.35, min: 0, max: 4, step: 0.05, unit: 'm', group: 'Hoops · defense',
    source: 'lib/babylon/hoops/pressure.ts ONBALL_CUSHION_M',
    hint: 'The on-ball defender\'s cushion on a dribbler is capped at this. 0 = today\'s contain lever, uncapped.',
  },
  {
    id: 'hoops.onBallCushionPerMps', label: 'On-ball: more room per m/s of the handler', def: 0.3, min: 0, max: 0.8, step: 0.01, unit: 's', group: 'Hoops · defense',
    source: 'lib/babylon/hoops/pressure.ts ONBALL_CUSHION_PER_MPS',
    hint: 'The cushion grows by this × his speed: a sprint at the defender gets room to give ground in, a probing dribble gets pressure.',
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
  // ── hoops-reverse (#311's H3a, ported): the ball handler's stick (core/HoopsStick). hoops-p01 (controls that answer): five defaults are
  //    the 1v1 / 3v3 handler's TUNED ones (H3a's own numbers — jogTau, jogAccel, loadScale, the two stops) and three rows are new; the dunk
  //    approach (GEARS_HOOPS) keeps the release values unless a knob is dialled. RELEASE_STICK_PRESET is the release stick in one paste. ──
  {
    id: 'hoops.jogTau', label: 'Jog: lag to top speed', def: 0.1, min: 0.05, max: 0.4, step: 0.01, unit: 's', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_JOG_TAU',
    hint: 'How quickly a pushed stick reaches jog speed (lower = snappier). TUNED 0.17 → 0.10 (H3a\'s); release 0.17.',
  },
  {
    id: 'hoops.sprintTau', label: 'Sprint: lag to top speed', def: 0.15, min: 0.05, max: 0.4, step: 0.01, unit: 's', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_SPRINT_TAU',
    hint: 'How quickly the turbo reaches sprint speed (lower = snappier). H3a: 0.10.',
  },
  {
    id: 'hoops.jogAccel', label: 'Jog: acceleration cap', def: 22, min: 5, max: 40, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_JOG_ACCEL',
    hint: 'The most the handler gains per second toward a jog. TUNED 15 → 22 (H3a\'s); release 15.',
  },
  {
    id: 'hoops.sprintAccel', label: 'Sprint: acceleration cap', def: 24, min: 5, max: 40, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_SPRINT_ACCEL',
    hint: 'The most the handler gains per second toward a sprint. H3a: 26.',
  },
  {
    id: 'hoops.loadScale', label: 'First step: load', def: 0.7, min: 0.2, max: 1, step: 0.05, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_LOAD_SCALE',
    hint: 'Share of the acceleration on the first step from a standstill (1 = no loaded step). TUNED 0.45 → 0.7 (H3a\'s); release 0.45.',
  },
  {
    id: 'hoops.gearDownDecel', label: 'Off the turbo: ease-down', def: 9, min: 3, max: 30, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_GEAR_DOWN_DECEL',
    hint: 'How fast the speed eases down when the turbo is let go with the stick held. H3a: 12.',
  },
  {
    id: 'hoops.stopDecelLow', label: 'Stop: brake from a walk', def: 32, min: 8, max: 60, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_STOP_DECEL_LOW',
    hint: 'The brake when the stick is released at a walk. TUNED 22 → 32 (H3a\'s); release 22.',
  },
  {
    id: 'hoops.stopDecelHigh', label: 'Stop: brake from a sprint', def: 26, min: 5, max: 60, step: 1, unit: 'm/s²', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_STOP_DECEL_HIGH',
    hint: 'The brake when the stick is released at top speed (lower = a longer slide). TUNED 11 → 26 (H3a\'s); release 11 (a sprint slid 1.4 m).',
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
  // hoops-p01 (new): the ball handler's answers — GEARS_HANDLER only (the dunk approach never reads them)
  {
    id: 'hoops.firstStepMps', label: 'First step: the answer to the press', def: 0.3, min: 0, max: 1.5, step: 0.05, unit: 'm/s', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_FIRST_STEP_MPS',
    hint: 'A stick pushed from a standstill starts the body at this speed on the press\'s own frame, then the ramp. 0 = none (release).',
  },
  {
    id: 'hoops.reversePlantHold', label: 'Reversal: plant holds the old line (1) / brakes through (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_REVERSE_PLANT_HOLD',
    hint: '1 = release: a stick thrown back at pace keeps sliding the old way for the plant (0.12 s) before it brakes. 0 = the plant brakes straight through zero.',
  },
  {
    id: 'hoops.reverseLaunchSec', label: 'Reversal: push-off launch', def: 0.2, min: 0, max: 0.6, step: 0.05, unit: 's', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_REVERSE_LAUNCH_SEC',
    hint: 'Out of a reversal the first step the new way is a launch (no loaded step, a move\'s boost) for this long. 0 = a loaded step (release).',
  },
  // ── hoops-overtime (NB-3): a 3v3 level at the horn is sudden-death overtime on its own clock (modes/threevthreeOvertime) ──
  {
    id: 'hoops.overtime3v3Sec', label: 'Overtime clock 3v3', def: 30, min: 10, max: 90, step: 5, unit: 's', group: 'Hoops · rules',
    source: 'lib/babylon/modes/threevthreeOvertime.ts OVERTIME_3V3_SEC',
    hint: 'A 3v3 tied at the horn plays sudden death on this clock: the next bucket wins; still level when it runs out, another overtime.',
  },
  // ── hoops-shot-content (hoops round 2): the free-throw trip's beats and the bank's look (presentation; no window, no odds) ──
  {
    id: 'hoops.ftSetupSec', label: 'Free throw: whistle to the line', def: 0.9, min: 0.3, max: 2.0, step: 0.05, unit: 's', group: 'Hoops · shooting',
    source: 'lib/babylon/core/FreeThrows.ts FT_SETUP_SEC',
    hint: 'The dead-ball setup: the cut to the shooter on the stripe before the routine starts.',
  },
  {
    id: 'hoops.ftRoutineSec', label: 'Free throw: routine', def: 1.2, min: 0.4, max: 3.0, step: 0.05, unit: 's', group: 'Hoops · shooting',
    source: 'lib/babylon/core/FreeThrows.ts FT_ROUTINE_SEC',
    hint: 'The dribbles at the stripe before the ball comes up to the set.',
  },
  {
    id: 'hoops.ftSetSec', label: 'Free throw: the set', def: 0.3, min: 0.1, max: 1.0, step: 0.05, unit: 's', group: 'Hoops · shooting',
    source: 'lib/babylon/core/FreeThrows.ts FT_SET_SEC',
    hint: 'The ball up to the set before the line meter can start (a press during it waits).',
  },
  {
    id: 'hoops.ftResultSec', label: 'Free throw: result shown', def: 1.1, min: 0.4, max: 2.5, step: 0.05, unit: 's', group: 'Hoops · shooting',
    source: 'lib/babylon/core/FreeThrows.ts FT_RESULT_SEC',
    hint: 'How long a free throw\'s make or miss is shown before the next one (or the end of the trip).',
  },
  {
    id: 'hoops.ftDistNarrow01', label: 'Free throw: jumper narrowing at the line', def: 0, min: 0, max: 1, step: 0.05, unit: '', group: 'Hoops · shooting',
    source: 'lib/babylon/core/FreeThrows.ts FT_DIST_NARROW_01',
    hint: 'Share of a jumper\'s distance narrowing the line\'s green takes: 0 = the full open window (±65 ms, owner 2026-10-24), 1 = a jumper from 4.19 m (±59 ms).',
  },
  {
    id: 'hoops.bankSetDeg', label: 'Bank: angled set', def: 12, min: 0, max: 25, step: 1, unit: '°', group: 'Hoops · shooting',
    source: 'lib/babylon/hoops/shotLooks.ts BANK_SET_DEG',
    hint: 'How far the shooter turns toward the glass while R1 "called glass" is held in the bank band (look only; the ball\'s route is unchanged).',
  },
  {
    id: 'hoops.bankGlanceMs', label: 'Bank: glance at the glass', def: 1100, min: 300, max: 2500, step: 50, unit: 'ms', group: 'Hoops · shooting',
    source: 'lib/babylon/hoops/shotLooks.ts BANK_GLANCE_MS',
    hint: 'How long the eyes stay on the square after the set and the release of a called bank.',
  },
  // ── tiebreak-cam (2026-10-23): Tennis and its tiebreak variant, a phone held upright only ──
  {
    id: 'tennis.portraitHeroMargin', label: 'Upright: keep the player this far in', def: 0.15, min: 0.05, max: 0.35, step: 0.01, unit: '', group: 'Tennis · camera',
    source: 'lib/babylon/modes/netPortraitCam.ts PORTRAIT_HERO_MARGIN',
    hint: 'Share of the frame width kept between the player and each side edge; the camera turns only when he would come closer. Wide screens never.',
  },  // ── dunk-flagship (owner playtest 2026-10-27: "smoother movement, better lobs") ──
  {
    id: 'dunk.runwayStrideScale', label: 'Run-up: stride length', def: 1, min: 0.8, max: 1.4, step: 0.01, unit: '×', group: 'Dunk · run-up',
    source: 'lib/babylon/core/DunkFlagship.ts RUNWAY_STRIDE_SCALE',
    hint: 'The run-up\'s legs are paced to the run at 1 (as shipped). Higher = slower, longer steps for the same speed (feet slide forward); lower = quicker steps (feet slide back).',
  },
  {
    id: 'dunk.oopLobFlightSec', label: 'Alley-oop: lob time in the air', def: 1.0, min: 0.5, max: 1.6, step: 0.05, unit: 's', group: 'Dunk · lobs',
    source: 'lib/babylon/core/DunkFlagship.ts OOP_LOB_FLIGHT_SEC',
    hint: 'How long the passer\'s lob hangs, release to the catch. Longer = a higher, slower arc thrown earlier in your run.',
  },
  {
    id: 'dunk.oopLateCatchClipT', label: 'Alley-oop: catch beat when you jump early', def: 0.8, min: 0.6, max: 1.0, step: 0.05, unit: 's', group: 'Dunk · lobs',
    source: 'lib/babylon/core/DunkFlagship.ts OOP_LATE_CATCH_CLIP_T',
    hint: 'If you leave the floor before the passer has thrown, he lobs it as you jump and you catch it this far into your flight. Later = a higher drop into your hand, less time before the slam.',
  },
  {
    id: 'dunk.slamHitStopBigMs', label: 'Slam: freeze on a perfect flush', def: 100, min: 70, max: 160, step: 5, unit: 'ms', group: 'Dunk · slam',
    source: 'lib/babylon/core/DunkFlagship.ts SLAM_HITSTOP_BIG_MS',
    hint: 'How long the game holds on the iron for a perfect slam. An ordinary make stays at 70 ms; cleaner slams grow toward this.',
  },
  {
    id: 'dunk.slamShakeBig', label: 'Slam: shake on a perfect flush', def: 0.18, min: 0.12, max: 0.3, step: 0.01, unit: '', group: 'Dunk · slam',
    source: 'lib/babylon/core/DunkFlagship.ts SLAM_SHAKE_BIG',
    hint: 'Camera shake for a perfect slam. An ordinary make stays at 0.12. Reduced motion turns shake off.',
  },
  {
    id: 'dunk.landLeadSec', label: 'Landing: absorb starts before touchdown', def: 0, min: 0, max: 0.25, step: 0.01, unit: 's', group: 'Dunk · landing',
    source: 'lib/babylon/core/DunkFlagship.ts LAND_LEAD_SEC',
    hint: 'How early the landing crouch fades in while you fall. 0 = on touchdown (as shipped). Measured: earlier makes the hips arrive faster into the same short crouch.',
  },  // ── hoops-round2 (HOP-02, owner 2026-10-20): the AI defenders react late by difficulty (hoops/reaction; never in ranked / staked) ──
  {
    id: 'hoops.aiReactRookieMs', label: 'AI reaction: ROOKIE', def: 420, min: 0, max: 800, step: 10, unit: 'ms', group: 'Hoops · AI reaction',
    source: 'lib/babylon/hoops/reaction.ts AI_REACT_ROOKIE_MS',
    hint: 'How late a ROOKIE defender sees a change of direction (a cross, a stop, a reversal); a straight run is tracked with no lag.',
  },
  {
    id: 'hoops.aiReactProMs', label: 'AI reaction: PRO', def: 220, min: 0, max: 800, step: 10, unit: 'ms', group: 'Hoops · AI reaction',
    source: 'lib/babylon/hoops/reaction.ts AI_REACT_PRO_MS',
    hint: 'How late a PRO defender sees a change of direction. Staked and head-to-head runs always play PRO at this default.',
  },
  {
    id: 'hoops.aiReactEliteMs', label: 'AI reaction: ELITE', def: 120, min: 0, max: 800, step: 10, unit: 'ms', group: 'Hoops · AI reaction',
    source: 'lib/babylon/hoops/reaction.ts AI_REACT_ELITE_MS',
    hint: 'How late an ELITE defender sees a change of direction.',
  },
  // ── hoops-round2 (HOP-03, owner 2026-10-20): 3v3 team defence, the switch on a screen and the double team (hoops/teamDefense) ──
  {
    id: 'hoops.doubleTeamOn', label: 'Double team (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · team defense',
    source: 'lib/babylon/hoops/teamDefense.ts DOUBLE_TEAM_ON',
    hint: '1: a ball held deep in the paint draws a second defender. 0: one man on the ball, as before (an A/B).',
  },
  {
    id: 'hoops.doublePaintM', label: 'Double: ball this close to the rim', def: 3.0, min: 1.5, max: 5.0, step: 0.1, unit: 'm', group: 'Hoops · team defense',
    source: 'lib/babylon/hoops/teamDefense.ts DOUBLE_PAINT_M',
    hint: 'The ball inside this of the rim starts the double clock.',
  },
  {
    id: 'hoops.doubleAfterSec', label: 'Double: after this long there', def: 0.45, min: 0.1, max: 2.0, step: 0.05, unit: 's', group: 'Hoops · team defense',
    source: 'lib/babylon/hoops/teamDefense.ts DOUBLE_AFTER_SEC',
    hint: 'How long the ball stays deep before the help comes.',
  },
  {
    id: 'hoops.doubleMaxSec', label: 'Double: lasts at most', def: 2.0, min: 0.5, max: 5.0, step: 0.1, unit: 's', group: 'Hoops · team defense',
    source: 'lib/babylon/hoops/teamDefense.ts DOUBLE_MAX_SEC',
    hint: 'The doubler goes back to his man after this, if the ball has not been passed.',
  },
  {
    id: 'hoops.doubleCooldownSec', label: 'Double: none again for', def: 4.0, min: 0, max: 10, step: 0.5, unit: 's', group: 'Hoops · team defense',
    source: 'lib/babylon/hoops/teamDefense.ts DOUBLE_COOLDOWN_SEC',
    hint: 'No new double for this long after one ends.',
  },
  {
    id: 'hoops.switchOnScreenOn', label: 'Switch on a screen (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · team defense',
    source: 'lib/babylon/hoops/teamDefense.ts SWITCH_ON_SCREEN_ON',
    hint: '1: a pick on the ball defender makes the screener\'s man take the ball. 0: he fights through, as before (an A/B).',
  },
  {
    id: 'hoops.switchHelpM', label: 'Switch: the helper this close', def: 2.6, min: 1.0, max: 4.0, step: 0.1, unit: 'm', group: 'Hoops · team defense',
    source: 'lib/babylon/hoops/teamDefense.ts SWITCH_HELP_M',
    hint: 'The screener\'s defender switches onto the ball only from this close to the handler.',
  },
  {
    id: 'hoops.switchCooldownSec', label: 'Switch: one per', def: 1.5, min: 0.3, max: 5.0, step: 0.1, unit: 's', group: 'Hoops · team defense',
    source: 'lib/babylon/hoops/teamDefense.ts SWITCH_COOLDOWN_SEC',
    hint: 'No two switches closer together than this.',
  },
  // ── hoops-round2 (HOP-04, owner 2026-10-20): hand-checks (too many = a foul) and the contact poses (hoops/handCheck, hoops/contactPoses) ──
  {
    id: 'hoops.handCheckOn', label: 'Hand-checks (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · contact',
    source: 'lib/babylon/hoops/handCheck.ts HAND_CHECK_ON',
    hint: '1: the on-ball defender\'s forearm on the hip is counted, and too many is a foul. 0: nothing counted or drawn (an A/B).',
  },
  {
    id: 'hoops.handCheckReachOverM', label: 'Hand-check: reach past the hard gap', def: 0.15, min: 0, max: 0.5, step: 0.01, unit: 'm', group: 'Hoops · contact',
    source: 'lib/babylon/hoops/handCheck.ts HAND_CHECK_REACH_OVER_M',
    hint: 'The forearm is on the hip inside the bodies\' hard gap (BODY_STANDOFF, unchanged) plus this.',
  },
  {
    id: 'hoops.handCheckGapSec', label: 'Hand-check: off this long to count again', def: 0.3, min: 0.05, max: 1.5, step: 0.05, unit: 's', group: 'Hoops · contact',
    source: 'lib/babylon/hoops/handCheck.ts HAND_CHECK_GAP_SEC',
    hint: 'A hand that comes back sooner is the same touch.',
  },
  {
    id: 'hoops.handCheckFoulCount', label: 'Hand-check: touches that foul', def: 4, min: 2, max: 10, step: 1, unit: '', group: 'Hoops · contact',
    source: 'lib/babylon/hoops/handCheck.ts HAND_CHECK_FOUL_COUNT',
    hint: 'This many touches inside the window is the HAND-CHECK whistle.',
  },
  {
    id: 'hoops.handCheckWindowSec', label: 'Hand-check: inside this long', def: 5, min: 1, max: 15, step: 0.5, unit: 's', group: 'Hoops · contact',
    source: 'lib/babylon/hoops/handCheck.ts HAND_CHECK_WINDOW_SEC',
    hint: 'The window the touches are counted in.',
  },
  {
    id: 'hoops.contactPoseOn', label: 'Contact poses (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · contact',
    source: 'lib/babylon/hoops/handCheck.ts CONTACT_POSE_ON',
    hint: '1: forearm toward the hip, the arm bar, the chest in at the hard gap (drawn only). 0: the clips alone, as before.',
  },
  {
    id: 'hoops.contactEaseInSec', label: 'Contact pose: eases in over', def: 0.12, min: 0.02, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · contact',
    source: 'lib/babylon/hoops/handCheck.ts CONTACT_EASE_IN_SEC',
    hint: 'How fast the contact pose comes on.',
  },
  {
    id: 'hoops.contactEaseOutSec', label: 'Contact pose: eases out over', def: 0.2, min: 0.02, max: 0.8, step: 0.01, unit: 's', group: 'Hoops · contact',
    source: 'lib/babylon/hoops/handCheck.ts CONTACT_EASE_OUT_SEC',
    hint: 'How fast it lets go.',
  },
  {
    id: 'hoops.contactChestLeanDeg', label: 'Contact pose: chest lean in', def: 7, min: 0, max: 15, step: 1, unit: '°', group: 'Hoops · contact',
    source: 'lib/babylon/hoops/contactPoses.ts CHEST_LEAN_DEG',
    hint: 'How far the defender\'s chest leans into the handler at full contact.',
  },
  // hoops-p03 (1v1/3v3 phase 3 "rivals that play basketball"): the 1v1 rival's kit and reads (hoops/rivalOffense), the 3v3 team offence
  // (hoops/teamOffense3v3). Every default is this lane's; the owner has felt none of them.
  {
    id: 'hoops.rivalKitOn', label: '1v1 rival: move kit (0 = the old script)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_KIT_ON',
    hint: '1: the rival picks moves by reading you (crossover, hesitation, in-and-out, behind, spin, post-up) and a finish by tier. 0: the release\'s script exactly (an A/B).',
  },
  {
    id: 'hoops.rivalTightM', label: '1v1 rival: a defender inside this is tight', def: 1.25, min: 0.8, max: 2, step: 0.05, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_TIGHT_M',
    hint: 'Tight invites the spin, the hesitation and the post-up; further off, the crossover and the in-and-out.',
  },
  {
    id: 'hoops.rivalHesiSec', label: '1v1 rival: the hesitation\'s sell', def: 0.3, min: 0.1, max: 0.8, step: 0.02, unit: 's', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_HESI_SEC',
    hint: 'How long he crawls before the go.',
  },
  {
    id: 'hoops.rivalHesiGoMps', label: '1v1 rival: the hesitation\'s go', def: 5.8, min: 3, max: 7, step: 0.1, unit: 'm/s', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_HESI_GO_MPS',
    hint: 'The burst after the sell (your top speed is 6.4: a man who stayed down keeps up).',
  },
  {
    id: 'hoops.rivalSpinSec', label: '1v1 rival: the spin', def: 0.6, min: 0.3, max: 1.2, step: 0.05, unit: 's', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_SPIN_SEC',
    hint: 'Into your shoulder, then the roll off it.',
  },
  {
    id: 'hoops.rivalPostMinM', label: '1v1 rival: post-up from (rim distance)', def: 2.6, min: 1.5, max: 4, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_POST_MIN_M',
    hint: 'He only posts up this far or further from the rim…',
  },
  {
    id: 'hoops.rivalPostMaxM', label: '1v1 rival: post-up to (rim distance)', def: 5.6, min: 3, max: 8, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_POST_MAX_M',
    hint: '…and this close or closer.',
  },
  {
    id: 'hoops.rivalPostMps', label: '1v1 rival: the back-down\'s pace', def: 1.4, min: 0.5, max: 3, step: 0.1, unit: 'm/s', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_POST_MPS',
    hint: 'How hard he backs you down (your body holds him, or gives ground).',
  },
  {
    id: 'hoops.rivalPostMaxSec', label: '1v1 rival: the longest post-up', def: 1.6, min: 0.5, max: 3, step: 0.1, unit: 's', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_POST_MAX_SEC',
    hint: 'Then the turnaround fade.',
  },
  {
    id: 'hoops.rivalPostHookM', label: '1v1 rival: the hook from inside', def: 2.3, min: 1.2, max: 3.5, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_POST_HOOK_M',
    hint: 'Backed down this close, the post ends in a hook (a layup\'s odds).',
  },
  {
    id: 'hoops.rivalFloaterMinM', label: '1v1 rival: floater corridor from', def: 2, min: 1, max: 4, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_FLOATER_MIN_M',
    hint: 'Held in front this far from the rim or further…',
  },
  {
    id: 'hoops.rivalFloaterMaxM', label: '1v1 rival: floater corridor to', def: 4.2, min: 2.5, max: 6, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_FLOATER_MAX_M',
    hint: '…and this close or closer, the finish can be a floater (a jumper\'s odds from there).',
  },
  {
    id: 'hoops.rivalSagM', label: '1v1 rival: the sag read', def: 2.6, min: 0, max: 4, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_SAG_M',
    hint: 'You in his lane but this far off: PRO and ELITE take the pull-up. 0 = never.',
  },
  {
    id: 'hoops.rivalPullUpRangeM', label: '1v1 rival: the sag pull-up\'s range', def: 6.2, min: 3, max: 9, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_PULLUP_RANGE_M',
    hint: 'The sag read only from inside this of the rim.',
  },
  {
    id: 'hoops.rivalAdaptK', label: '1v1 rival: memory', def: 1, min: 0, max: 2, step: 0.05, unit: '×', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_ADAPT_K',
    hint: 'How hard he leans on what worked against you (× the tier\'s adapt rate: ROOKIE 0, PRO 0.35, ELITE 0.75). 0 = no memory.',
  },
  {
    id: 'hoops.rivalClosingMps', label: '1v1 rival: you are biting at', def: 1.6, min: 0.5, max: 4, step: 0.1, unit: 'm/s', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_CLOSING_MPS',
    hint: 'Closing on him this fast reads as a bite: the hesitation.',
  },
  {
    id: 'hoops.teamOffenseOn', label: '3v3 rivals: team offence (0 = one drive)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts TEAM_OFFENSE_ON',
    hint: '1: their ball is a team\'s offence on bodies (take it back, probe, screen, swing, attack). 0: the release\'s one scripted drive exactly (an A/B).',
  },
  {
    id: 'hoops.rivalTakeBackM', label: '3v3 rivals: take it back beyond', def: 6.9, min: 0, max: 9, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts RIVAL_TAKE_BACK_M',
    hint: 'A fresh possession starts this far from the rim (0 = start where he is).',
  },
  {
    id: 'hoops.rivalHandlerMps', label: '3v3 rivals: the handler\'s pace off the drive', def: 3.4, min: 2, max: 5, step: 0.1, unit: 'm/s', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts RIVAL_HANDLER_MPS',
    hint: 'Taking it back, probing, waiting on the screen.',
  },
  {
    id: 'hoops.rivalProbeSec', label: '3v3 rivals: the probe at the top', def: 1.4, min: 0, max: 4, step: 0.1, unit: 's', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts RIVAL_PROBE_SEC',
    hint: 'Sizing his man up before the screen, the swing or the attack (× the tier, ±30 %).',
  },
  {
    id: 'hoops.rivalScreenWaitSec', label: '3v3 rivals: waits on the screen up to', def: 2.4, min: 0.5, max: 5, step: 0.1, unit: 's', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts RIVAL_SCREEN_WAIT_SEC',
    hint: 'Then he goes without it.',
  },
  {
    id: 'hoops.rivalBudgetSec', label: '3v3 rivals: the possession budget', def: 10, min: 4, max: 20, step: 0.5, unit: 's', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts RIVAL_BUDGET_SEC',
    hint: 'Past this the handler attacks now (× the tier: ROOKIE 0.8, ELITE 1.05).',
  },
  {
    id: 'hoops.rivalAttackPullUpSec', label: '3v3 rivals: held in front, pull up after', def: 0.8, min: 0.3, max: 3, step: 0.05, unit: 's', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts RIVAL_ATTACK_PULLUP_SEC',
    hint: 'A drive held in front this long becomes a pull-up (inside the arc).',
  },
  {
    id: 'hoops.rivalPullUpMaxM', label: '3v3 rivals: pull-up range', def: 6, min: 3, max: 8, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts RIVAL_PULLUP_MAX_M',
    hint: 'The off-the-dribble pull-up is taken only inside this (the release\'s jumper base has no range term).',
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
