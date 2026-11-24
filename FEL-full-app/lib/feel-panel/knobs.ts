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
  // ── lane/online-play (2026-11-21): one shared game online. NOTE: the panel's session gate keeps overrides OFF in online and
  // party runs (sessionGate.ts), so these are the shipped numbers and the switches that restore the old behaviour, set in code ──
  {
    id: 'net.mirrorOn', label: 'Online: one shared game (1) / each page its own game (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Online play',
    source: 'lib/net/knobs.ts NET_MIRROR_ON',
    hint: 'On: one page runs the game and every other page draws it. Off: the old behaviour, where each page ran its own game.',
  },
  {
    id: 'net.renderDelayMs', label: 'Online: draw this far behind (0 = adaptive)', def: 0, min: 0, max: 300, step: 10, unit: 'ms', group: 'Online play',
    source: 'lib/net/knobs.ts NET_RENDER_DELAY_MS',
    hint: 'How far in the past another page draws the shared game, to hide late packets. 0 measures the jitter and picks 66 to 250 ms.',
  },
  {
    id: 'net.poseHz', label: 'Online: body pose updates per second', def: 15, min: 5, max: 30, step: 1, unit: '/s', group: 'Online play',
    source: 'lib/net/knobs.ts NET_POSE_HZ',
    hint: 'How often the bodies\' poses are sent (positions and the ball always go 30 times a second). Higher looks smoother and costs more data.',
  },
  {
    id: 'net.possessionSwap', label: 'Online 1v1: the player with the ball runs the game (1) / the host runs it all (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Online play',
    source: 'lib/net/knobs.ts NET_POSSESSION_SWAP',
    hint: 'On: both players attack with every move. Off: the host runs every possession and the guest only defends.',
  },
  {
    id: 'net.karateTogether', label: 'Start together offers Karate co-op (1) / hides it (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Online play',
    source: 'lib/party/social/startable.ts NET_KARATE_TOGETHER',
    hint: 'Karate co-op is not a shared game yet (each page fights its own horde). 1 offers it anyway, as before.',
  },
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
  },  {
    id: 'hoops.moveHandEaseOn', label: 'Moves: the hands ease too (1) / as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/MoveEase.ts MOVE_HAND_EASE_ON',
    hint: 'On: through a handle move no hand turns faster than the rate below from where it was drawn (the behind-the-back hand whip). Off: as before.',
  },
  {
    id: 'hoops.moveHandRateDeg', label: 'Moves: fastest a hand turns', def: 1800, min: 600, max: 4000, step: 100, unit: '°/s', group: 'Hoops · handle (rest)',
    source: 'lib/babylon/anim/MoveEase.ts MOVE_HAND_RATE_DEG',
    hint: 'With the hand ease on: how fast a hand may turn in a move.',
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
    id: 'hoops.myStripHandOn', label: 'My poke: also needs a hand on the ball (1) / the read alone (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/hoops/steals.ts MY_STRIP_HAND_ON',
    hint: 'On: my steal on a 1v1 or 3v3 handler lands only when my hand can get to his ball by the AI strip rule below (reach, his body shielding a ball in his far hand, the ball off the palm), on top of the read of when the ball is exposed; and a bump opens my strip window only when he ran into me, as the AI bump strip opens only when I run into him. Off: the read alone and any contact opening the window, as before.',
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
    id: 'hoops.turnTrueArc', label: 'Turn: true arc (1) / lerp (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_TURN_TRUE_ARC',
    hint: '1 = a turn rotates at the full turn rate (on since 2026-11-17); 0 = the old steer, which turns wide angles slower.',
  },
  {
    id: 'hoops.kickSec', label: 'Turbo kick: spread over', def: 0.1, min: 0, max: 0.3, step: 0.01, unit: 's', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_KICK_SEC',
    hint: 'The kick of a turbo press is added over this long (0.1 since 2026-11-17; 0 = all in one frame, the old kick).',
  },
  {
    id: 'hoops.cutSec', label: 'Cut cost: paid over', def: 0.08, min: 0, max: 0.3, step: 0.01, unit: 's', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HANDLER_CUT_SEC',
    hint: 'The speed a cut costs is paid over this long (0.08 since 2026-11-17; 0 = in one frame, the old cut).',
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
  // lane/move-feel-2 (new, owner 2026-11-17): a held stick keeps the court frame it was pushed in (core/StickFrame)
  {
    id: 'hoops.stickFrameHold', label: 'Stick: held stick runs a straight line (1) / turns with the camera (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/core/StickFrame.ts HOOPS_STICK_FRAME_HOLD',
    hint: '1v1 and 3v3. 1 = the direction a held stick points on the court stays put while the camera swings round the rim. 0 = the old stick, read against the live camera every frame (a held stick bent the run 30 to 43 degrees a second).',
  },
  // lane/move-feel-2 (new, owner 2026-11-17): the floating MOVE stick on the hoops touch deck (lib/babylon/ui/floatStick)
  {
    id: 'touch.floatStick', label: 'Phone: floating move stick (1) / fixed (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/ui/floatStick.ts TOUCH_FLOAT_STICK',
    hint: '1v1 and 3v3 on a touch screen. 1 = the stick appears under the thumb, 1.5 times the old size, a 10 percent dead zone. 0 = the old fixed 96 px stick.',
  },
  {
    id: 'touch.dpadTapOn', label: 'Phone: d-pad arrows a 44 px tap (1) / 24 px (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/ui/dpadTap.ts TOUCH_DPAD_TAP_ON',
    hint: 'Every mode on a touch screen. 1 = each d-pad arrow is at least 44 px as drawn: a row of four on an upright phone, a bigger cross sideways. 0 = the old 24 px cross.',
  },
  // lane/move-feel (new, 2026-11-12): the walk / jog line eased (0 = the step as shipped) — GEARS_HANDLER only (the dunk run-up never reads it)
  {
    id: 'hoops.gearBlendBand', label: 'Stick: walk to jog blend', def: 0.2, min: 0, max: 0.4, step: 0.05, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_GEAR_BLEND_BAND',
    hint: 'Past the walk line the jog starts at 85 % of its top: a thumb near the line surges 2.4 to 3.7 m/s. This eases it over this much more stick (0.2 since 2026-11-17). 0 = the old step.',
  },
  {
    id: 'hoops.stickSprintFallback', label: 'Stick: full push sprints until TURBO is touched (1) / never (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · movement',
    source: 'lib/babylon/core/HoopsStick.ts HOOPS_STICK_SPRINT_FALLBACK',
    hint: 'Before 2026-11-17 (1), a stick past 0.85 is the turbo until a trigger or the TURBO pad has been used once; then the same push jogs. 0 (since 2026-11-17) = the turbo is the button only.',
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
    id: 'dunk.runwayStrideScale', label: 'Run-up: stride length', def: 1.1, min: 0.8, max: 1.4, step: 0.01, unit: '×', group: 'Dunk · run-up',
    source: 'lib/babylon/core/DunkFlagship.ts RUNWAY_STRIDE_SCALE',
    hint: 'The run-up\'s legs are paced to the run at 1.1 (default since 2026-11-10; it was 1, which still restores the old pace). Higher = slower, longer steps for the same speed (feet slide forward); lower = quicker steps (feet slide back).',
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
    id: 'dunk.preloadSet', label: 'Load the contest before dunk 1 on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Dunk · loading',
    source: 'lib/babylon/modes/dunkContestDefer.ts DUNK_PRELOAD_SET_ON',
    hint: 'On: the rival and the five boardwalk onlookers load and set up, and the landing and replay shaders compile, while the contest intro plays. The first run waits for them (20 s at most). Off: they load between rounds. Read when the dunk loads.',
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
  },
  {
    id: 'dunk.realJumpPersonal', label: 'Body dunk: your verified jump is a full take-off', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Dunk · body',
    source: 'lib/babylon/core/DunkFlagship.ts REAL_JUMP_PERSONAL',
    hint: 'Off (as shipped): a 0.70 m jump fills the take-off. On: your own verified best jump (a saved Quick Screen, verified adult accounts only) fills it.',
  },
  {
    id: 'dunk.slamVariants', label: 'Slam: stick back = REVERSE, stick up = TWO-HAND POWER', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Dunk · finishes',
    source: 'lib/babylon/core/DunkSlamVariant.ts SLAM_VARIANTS_ON',
    hint: 'On (default since 2026-11-10): the left stick held at the A press inside the slam window calls the finish — back a REVERSE (the back to the iron), up a TWO-HAND POWER — named on the card. Off: the slam is the flush the flight carries, as before. Never in staked, ranked or challenge play. The air tricks (d-pad + button) are unchanged.',
  },
  {
    id: 'dunk.finishOverRing', label: 'Finish: the hand carries the ball over the ring', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Dunk · finishes',
    source: 'lib/babylon/core/DunkOverRing.ts FINISH_OVER_RING',
    hint: 'On (default since 2026-11-10): the body carries the ball over the ring and the hand brings it down inside, so it is let go over the hole. Off: the ball meets the front of the rim and the flush carries it in, as before. Never in staked, ranked or challenge play.',
  },
  {
    id: 'dunk.slamPower', label: 'Slam: stick up = TWO-HAND POWER', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Dunk · finishes',
    source: 'lib/babylon/core/DunkSlamVariant.ts SLAM_POWER_ON',
    hint: 'The TWO-HAND POWER on its own (with the slam variants on). Off: the stick up calls nothing; the REVERSE is unchanged.',
  },
  {
    id: 'dunk.landAbsorbDeep', label: 'Landing: deep absorb', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Dunk · landing',
    source: 'lib/babylon/core/DunkFlagship.ts LAND_ABSORB_DEEP',
    hint: 'On (default since 2026-11-10): the knees take about 25 cm of the landing in about 0.12 s. Off: the shallower landing as before.',
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
  // ── gameplay-clean (2026-10-28): what blocks the camera's view of the hero goes see-through (every mode but the hoops lanes') ──
  {
    id: 'camera.occluderFadeAlpha', label: 'Blocking prop: fades to', def: 0.25, min: 0, max: 1, step: 0.05, unit: '', group: 'Camera · occluders',
    source: 'lib/babylon/core/OccluderFade.ts OCCLUDER_FADE_ALPHA',
    hint: 'How see-through a pole, tree or wall gets while it stands between the camera and you. 1 = never fades.',
  },
  {
    id: 'camera.occluderFadeSec', label: 'Blocking prop: fade time', def: 0.18, min: 0, max: 1, step: 0.02, unit: 's', group: 'Camera · occluders',
    source: 'lib/babylon/core/OccluderFade.ts OCCLUDER_FADE_SEC',
    hint: 'How quickly it fades out, and back in.',
  },
  {
    id: 'camera.occluderHoldSec', label: 'Blocking prop: stays faded', def: 0.4, min: 0, max: 2, step: 0.05, unit: 's', group: 'Camera · occluders',
    source: 'lib/babylon/core/OccluderFade.ts OCCLUDER_HOLD_SEC',
    hint: 'How long after it stops blocking before it comes back (stops a pole flickering as the camera sweeps past).',
  },
  // GAMEPLAY-CLEAN P2 #10 (2026-11-03): the follow camera's look-ahead eases instead of swinging in a frame (CameraDirector.aim)
  {
    id: 'camera.leadEaseSec', label: 'Look-ahead: ease time', def: 0.2, min: 0, max: 1, step: 0.05, unit: 's', group: 'Camera · follow',
    source: 'lib/babylon/core/CameraDirector.ts CAM_LEAD_EASE_SEC',
    hint: 'How long the point the camera looks at (ahead of the player) takes to swing to a new direction. 0 = the old instant swing (a stop, an ollie or a turnaround jerked the view).',
  },
  {
    id: 'camera.leadFullMps', label: 'Look-ahead: full at speed', def: 1, min: 0.1, max: 4, step: 0.1, unit: 'm/s', group: 'Camera · follow',
    source: 'lib/babylon/core/CameraDirector.ts CAM_LEAD_FULL_MPS',
    hint: 'Ground speed at which the camera looks its full distance ahead; slower than this it looks closer to the player (no lead flicking around a near-standstill).',
  },
  // lane/move-feel (new, 2026-11-12): 1v1 / 3v3 take the eased look-ahead above (0 = their raw lead, as shipped)
  {
    id: 'hoops.camLeadEase', label: 'Hoops camera: eased look-ahead (1) / instant (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Camera · follow',
    source: 'lib/babylon/core/CameraDirector.ts HOOPS_CAM_LEAD_EASE',
    hint: '1v1 and 3v3 only. 1 since 2026-11-17. 0 = the old camera: the point ahead of the player swings in one frame on a start, stop, cut or turnaround. 1 = it eases (the two look-ahead knobs above).',
  },
  // ── lane/hoops-cam (new, owner 2026-11-21: "When it follows it is hard to play. When it is stationary … it is easier"): the 1v1 high sideline view ──
  {
    id: 'hoops.oneVOneCam', label: '1v1 camera: high sideline (1) / follow (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts ONEVONE_CAM',
    hint: '1 = a high camera off the sideline that never turns, so up on the stick is always toward the rim. 0 = the follow camera exactly as before. SELECT or C switches during a game.',
  },
  {
    id: 'hoops.highCamHeightM', label: 'High camera: height', def: 6.8, min: 4, max: 14, step: 0.1, unit: 'm', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_HEIGHT_M',
    hint: 'How high the 1v1 high camera stands over the floor.',
  },
  {
    id: 'hoops.highCamDistM', label: 'High camera: distance back', def: 11.2, min: 7, max: 20, step: 0.1, unit: 'm', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_DIST_M',
    hint: 'How far back from the play it stands, along the floor. Further = more court, smaller players.',
  },
  {
    id: 'hoops.highCamSideDeg', label: 'High camera: swing to the sideline', def: 32, min: 0, max: 90, step: 1, unit: '°', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_SIDE_DEG',
    hint: '0 = straight behind the play, looking at the rim. 90 = side on from the sideline (the rim then sits at the side of the screen).',
  },
  {
    id: 'hoops.highCamFocusM', label: 'High camera: aim point from the rim', def: 3.8, min: 0, max: 8, step: 0.1, unit: 'm', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_FOCUS_M',
    hint: 'Where on the court the camera rests its aim, this far out from the rim.',
  },
  {
    id: 'hoops.highCamPanShare', label: 'High camera: how much it slides after the play', def: 0.3, min: 0, max: 1, step: 0.05, unit: '', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_PAN_SHARE',
    hint: '0 = it never slides (it still slides to keep both players and the rim on screen). 1 = it slides all the way after the players.',
  },
  {
    id: 'hoops.highCamPanSec', label: 'High camera: slide softness', def: 0.55, min: 0.1, max: 2, step: 0.05, unit: 's', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_PAN_SEC',
    hint: 'How slowly and softly it slides. Bigger = slower and smoother.',
  },
  {
    id: 'hoops.highCamMargin', label: 'High camera: room kept at the screen edge', def: 0.14, min: 0, max: 0.4, step: 0.01, unit: '', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_MARGIN',
    hint: 'How far in from the left and right edges the players and the rim are kept (a share of half the screen).',
  },
  {
    id: 'hoops.highCamPullMax', label: 'High camera: most it backs away to fit', def: 1.6, min: 1, max: 2, step: 0.05, unit: '×', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_PULL_MAX',
    hint: 'When both players and the rim cannot fit across the screen (a phone held upright), it backs away, never turning, up to this many times its distance. 1 = never.',
  },
  {
    id: 'hoops.highCamPortraitLift', label: 'High camera: phone upright, keep players above the buttons', def: 0.34, min: 0, max: 0.5, step: 0.01, unit: '', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_PORTRAIT_LIFT',
    hint: 'On a phone held upright, the share of the screen height at the bottom (where the touch buttons are) the players are kept out of.',
  },
  // ── lane/improve-camera (phase 8, 2026-11-22; new): the lens may widen to fit; the high view offered to 3v3 (OFF: the owner's feel call) ──
  {
    id: 'hoops.highCamZoomMax', label: 'High camera: most the lens widens to fit', def: 1.6, min: 1, max: 2, step: 0.05, unit: '×', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_ZOOM_MAX',
    hint: 'When the players and the rim still do not fit after it backs away (a tight court on a phone held upright), the lens widens, never turning, up to this many times, and back. 1 = never (as before).',
  },
  {
    id: 'hoops.highCamRoomOn', label: 'High camera: room to stand off the court (1) / the venue box (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_ROOM_ON',
    hint: '1 = on a small court (Canopy, Blossom) it may stand as far out as the 3-Point camera does there, still never inside or behind a tree. 0 = it keeps to the venue box, as before.',
  },
  {
    id: 'hoops.highCamLeadSec', label: 'High camera: how far ahead it reads a run', def: 0.35, min: 0, max: 0.8, step: 0.05, unit: 's', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts HIGH_CAM_LEAD_SEC',
    hint: 'It also keeps where each player will be this far ahead, so it starts sliding before a sprint reaches the edge instead of chasing it. 0 = only where they are now (as before).',
  },
  {
    id: 'hoops.threeVThreeCam', label: '3v3 camera: high sideline (1) / follow (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · camera',
    source: 'lib/babylon/core/HighSidelineCam.ts THREEVTHREE_CAM',
    hint: '1 = the 1v1 high camera in 3v3, keeping all six players and the rim on screen; it never turns. 0 = the 3v3 follow camera exactly as before (ships 0 until the owner tries it). SELECT or C switches during a game.',
  },
  // GAMEPLAY-CLEAN P2 #6 (2026-11-03): the football carry's stride paces to the carrier (footballTree)
  {
    id: 'football.carryStrideMax', label: 'Football carry: top stride rate', def: 1.4, min: 1, max: 1.85, step: 0.05, unit: '×', group: 'Anim · stride',
    source: 'lib/babylon/anim/footballTree.ts FOOTBALL_CARRY_RATE_MAX',
    hint: 'How fast the carry loop may cycle to keep the feet with the ground at speed. 1 = the old fixed cadence (feet skate); higher = quicker legs at top speed.',
  },
  // OWNER CALL (2026-11-10, delegated): the hurdle blends in over its own time (footballTree)
  {
    id: 'football.hurdleFadeSec', label: 'Football hurdle: blend-in time', def: 0.12, min: 0.04, max: 0.25, step: 0.01, unit: 's', group: 'Anim · transitions',
    source: 'lib/babylon/anim/footballTree.ts FOOTBALL_HURDLE_FADE_SEC',
    hint: 'How long the run blends into the hurdle jump. 0.06 = the old snap (thigh turns about 25 degrees in one frame); 0.12 = smoother (about 15); longer starts to lag behind the hop.',
  },
  {
    id: 'football.hurdleExitFadeSec', label: 'Football hurdle: blend-out time', def: 0.2, min: 0.06, max: 0.4, step: 0.02, unit: 's', group: 'Anim · transitions',
    source: 'lib/babylon/anim/footballTree.ts FOOTBALL_HURDLE_EXIT_FADE_SEC',
    hint: 'How long the hurdle jump blends back into the run. 0.1 = the old snap (the off arm turns about 31 degrees a frame for six frames); 0.2 = smoother (about 16); longer leaves the arms up after the landing.',
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
    id: 'hoops.rivalHesiSec', label: '1v1 rival: hesitation sell time', def: 0.3, min: 0.1, max: 0.8, step: 0.02, unit: 's', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_HESI_SEC',
    hint: 'How long he crawls before the go.',
  },
  {
    id: 'hoops.rivalHesiGoMps', label: '1v1 rival: hesitation burst speed', def: 5.8, min: 3, max: 7, step: 0.1, unit: 'm/s', group: 'Hoops · rival offense',
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
    id: 'hoops.rivalPostMaxM', label: '1v1 rival: post-up to (rim distance)', def: 10, min: 3, max: 12, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_POST_MAX_M',
    hint: '…and this close or closer.',
  },
  {
    id: 'hoops.rivalPostMps', label: '1v1 rival: back-down pace', def: 1.4, min: 0.5, max: 3, step: 0.1, unit: 'm/s', group: 'Hoops · rival offense',
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
    id: 'hoops.rivalFloaterMaxM', label: '1v1 rival: floater corridor to', def: 5, min: 2.5, max: 6, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_FLOATER_MAX_M',
    hint: '…and this close or closer, the finish can be a floater (a jumper\'s odds from there).',
  },
  {
    id: 'hoops.rivalSagM', label: '1v1 rival: the sag read', def: 2.6, min: 0, max: 4, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_SAG_M',
    hint: 'You in his lane but this far off: PRO and ELITE take the pull-up. 0 = never.',
  },
  {
    id: 'hoops.rivalPullUpRangeM', label: '1v1 rival: pull-up range when you sag', def: 6.2, min: 3, max: 9, step: 0.1, unit: 'm', group: 'Hoops · rival offense',
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
    id: 'hoops.rivalHandlerMps', label: '3v3 rivals: handler pace off the drive', def: 3.4, min: 2, max: 5, step: 0.1, unit: 'm/s', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts RIVAL_HANDLER_MPS',
    hint: 'Taking it back, probing, waiting on the screen.',
  },
  {
    id: 'hoops.rivalProbeSec', label: '3v3 rivals: the probe at the top', def: 1.6, min: 0, max: 4, step: 0.1, unit: 's', group: 'Hoops · rival offense',
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
    hint: 'Past this the handler attacks now (× the tier: ROOKIE 0.9, ELITE 1.05).',
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
  // hoops-gap (lane/hoops-gap, owner 2026-11-23 "close the gap and pass them"): new numbers, the owner has felt none of them.
  {
    id: 'hoops.aiShotIqOn', label: '3v3 rivals: shot IQ, the open man before a smothered pull-up (0 = off)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/teamOffense3v3.ts AI_SHOT_IQ_ON',
    hint: '1: held in front, the 3v3 handler swings it to a man his defender must close out on, else steps back once for room, then pulls up; at the rim with a body in his face he kicks to the open man. 0: as before.',
  },
  {
    id: 'hoops.pnrCoverageOn', label: 'Defence: pick-and-roll coverage, over a shooter, under one far out (0 = off)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/hoops/pnrCoverage.ts PNR_COVERAGE_ON',
    hint: '1: the man on the ball plays the screen (over inside 7.5 m, under past it), the screener\'s man shows or drops, a free roll man is tagged, and the switch comes only when beaten. 0: as before.',
  },
  {
    id: 'hoops.screenerRollOn', label: '3v3: the screener rolls when his own man steps up to the ball (0 = off)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/screenerRoll.ts SCREENER_ROLL_ON',
    hint: '1: a screener rolls or slips to the rim when his man has stepped up to the ball or nobody is on the near part of his line, and the handler looks for the open roll man. 0: he rolls only on a clear lane all the way to the rim, as before.',
  },
  {
    id: 'hoops.rollScoreOn', label: '3v3: the roll man scores, early slip, ghost screen, leading pass (0 = off)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · rival offense',
    source: 'lib/babylon/hoops/screenerRoll.ts ROLL_SCORE_ON',
    hint: 'Needs the screener roll switch too. 1: he slips the moment his man leaves him, cuts before planting when his man reads it early, the handler leads the pass to where he will be, and a catch at the rim goes up at once. 0: as before.',
  },
  {
    id: 'hoops.pnrFightFullOn', label: 'Defence: fighting over a screen costs no pace (0 = off)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · defense',
    source: 'lib/babylon/hoops/pnrCoverage.ts PNR_FIGHT_FULL_ON',
    hint: 'Needs the pick-and-roll coverage switch. 1: the man on the ball goes over the top at full speed. 0: at 0.7 of it, as before.',
  },
  {
    id: 'hoops.contactVoiceOn', label: 'Sound: contacts sound like hands on the ball and bodies (0 = off)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/hoopsSfx.ts CONTACT_VOICE_ON',
    hint: '1: on the court, a strip, poke or block plays a palm slap on the ball and a bump or check a low body thud, instead of the arcade impact boop; two contacts within 60 ms are one. 0: the impact, as before.',
  },
  {
    id: 'hoops.steppingDefenceOn', label: 'Defence: play the new stepping-defence clips when the rig has them (0 = off)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/basketballTree.ts STEPPING_DEFENCE_ON',
    hint: '1: the slides, the sat-down slides and the beaten-diagonal turn-and-run play the clips named in HOOPS-GAP-PLAN 6b when the rig owns them, at their own stride; a missing clip plays today\'s. 0: today\'s clips.',
  },
  // hoops-p04 (1v1/3v3 phase 4 "feet and transitions"): one blend + minimum-hold rule (anim/hoopsTransitions), the shot clips on their
  // release (hoops/releaseTiming). Every default is this lane's; the owner has felt none of them.
  {
    id: 'hoops.transitionRuleOn', label: 'Transitions: one blend + hold rule (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hoopsTransitions.ts TRANSITION_RULE_ON',
    hint: '1: every clip change a hoops body makes is floored and sibling loops held (anim/hoopsTransitions). 0: each state\'s own fade and the old dwell exactly.',
  },
  {
    id: 'hoops.gaitFadeSec', label: 'Transitions: gait loop to gait loop', def: 0.22, min: 0.05, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hoopsTransitions.ts GAIT_FADE_SEC',
    hint: 'The blend between the dribble / run loops (their legs are out of phase; time hides it).',
  },
  {
    id: 'hoops.defenseFadeSec', label: 'Transitions: defence loop to defence loop', def: 0.2, min: 0.05, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hoopsTransitions.ts DEFENSE_FADE_SEC',
    hint: 'The blend between the slides, the backpedal, the closeout, the crossover step.',
  },
  {
    id: 'hoops.crossFadeSec', label: 'Transitions: across groups / a settle', def: 0.2, min: 0.05, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hoopsTransitions.ts CROSS_FADE_SEC',
    hint: 'Offence to defence, and a loop after a beat or a hold.',
  },
  {
    id: 'hoops.beatFadeFloorSec', label: 'Transitions: shortest beat fade', def: 0.1, min: 0, max: 0.3, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hoopsTransitions.ts BEAT_FADE_FLOOR_SEC',
    hint: 'A move, a reach, a shot: the clip starts on the press, its weight comes in no faster than this.',
  },
  {
    id: 'hoops.priorityFadeSec', label: 'Transitions: shortest priority-cut fade', def: 0.08, min: 0, max: 0.3, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hoopsTransitions.ts PRIORITY_FADE_SEC',
    hint: 'A stagger, the floor, a dunk.',
  },
  {
    id: 'hoops.minHoldSec', label: 'Transitions: minimum loop hold', def: 0.22, min: 0, max: 0.6, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hoopsTransitions.ts MIN_HOLD_SEC',
    hint: 'A loop plays at least this long before a sibling loop replaces it (the old dwell, now for every loop group).',
  },
  {
    id: 'hoops.releaseToClipOn', label: 'Rival shots: release on the clip (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/hoops/releaseTiming.ts RELEASE_TO_CLIP_ON',
    hint: '1: the rival\'s jumper / finish clip is paced so the ball leaves on its release key. 0: the clip from its first frame at speed 1, as before.',
  },
  {
    id: 'hoops.jumperFromRiseOn', label: 'Jumper: enter at the rise (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/hoops/releaseTiming.ts JUMPER_FROM_RISE_ON',
    hint: '1: the hero\'s jumper skips its load dip (the ball rises on the press) and is paced from the rise to the green. 0: from its first frame.',
  },
  {
    id: 'hoops.plantReleaseFadeSec', label: 'Transitions: plant lock release fade', def: 0.12, min: 0, max: 0.4, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/basketballTree.ts PLANT_RELEASE_FADE_SEC',
    hint: 'A planted foot slides back to the clip over this when the cut lock ends, instead of in one frame. 0 = the old one-frame release.',
  },
  // hoops-p04b (1v1/3v3 phase 4b): the pops the rig traced to a layer
  {
    id: 'hoops.accentOffBeatsOn', label: 'Stop and start accent: off during a beat (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/locoAccent.ts ACCENT_OFF_BEATS_ON',
    hint: 'The stop and start sink is drawn on the dribble and run loops only, never over a gather or a move. 0 = it also drew over a beat started on its brake (the step-back thigh spike).',
  },
  {
    id: 'hoops.contactArmSwapSec', label: 'Contact poses: arm swap ease', def: 0.15, min: 0, max: 0.4, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/hoops/contactPoses.ts CONTACT_ARM_SWAP_SEC',
    hint: 'When the hand-check arm or the handler arm bar changes sides, or a handle move drops the bar, each arm eases over this. 0 = the one-frame swap.',
  },
  {
    id: 'hoops.carryArmSpeedSec', label: 'Ball carry: arm weights ease on a gear change', def: 0.12, min: 0, max: 0.4, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/ballCarry.ts CARRY_ARM_SPEED_SEC',
    hint: 'The dribble arm reach and the off arm swing follow the body speed eased over this, so a gear change does not move an arm in one frame. 0 = the frame speed, as before.',
  },
  // hoops-p05: the carry's let-go ends on the clip (the hero's last severe pop in the step-back gather)
  {
    id: 'hoops.carryLetGoToClipOn', label: 'Ball carry: the let-go ends on the clip (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/ballCarry.ts CARRY_LET_GO_TO_CLIP_ON',
    hint: 'When a shot or a pass takes the ball out of the dribble, the ball arm eases all the way back to the clip pose over the same fade. 0 = it eased part of the way and cut the rest in one frame.',
  },
  // hoops-p05b: the first bounce's palm rides the same fade as its ball (the gear stop into the sprint: the first top 12.8 cm off the palm)
  {
    id: 'hoops.carryStartHandOn', label: 'Ball carry: the first bounce palm follows the ball (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/ballCarry.ts CARRY_START_HAND_ON',
    hint: 'A dribble starts from where the hand held the ball, and that offset fades over the first bounce for the ball and the hand together, so the palm stays on the ball and the arm does not jump. 0 = only the ball took it (the palm sat up to 13 cm off it).',
  },
  // hoops-p05 (owner 2026-11-10: the hero's slide — fix it): stepping legs under the defensive beats
  {
    id: 'hoops.defenseLegsOn', label: 'Defense: legs keep stepping under a reach, a block or a hand up (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/basketballTree.ts DEFENSE_LEGS_ON',
    hint: 'While you reach, jump to block or hold a hand up on the move, your legs keep the slide or run they were in. 0 = the reach clip standing legs slid along the floor, as before.',
  },
  {
    id: 'hoops.backpedalReverseOn', label: 'Defense: the backpedal steps backward (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/basketballTree.ts BACKPEDAL_REVERSE_ON',
    hint: 'The retreat capture is a forward run. 1 plays it in reverse, so the feet plant while you back off. 0 = it ran forward on the spot while the body went backward, as before.',
  },
  {
    id: 'hoops.closeoutStepOn', label: 'Defense: the closeout steps at its pace (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/basketballTree.ts CLOSEOUT_STEP_ON',
    hint: 'A closeout plays chop steps that cover the ground you are covering, the high hand up. 0 = the old closeout, whose feet swung in place while the body slid.',
  },
  {
    id: 'hoops.loopInStepOn', label: 'Defense: a run into the stepping closeout stays in step (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/basketballTree.ts LOOP_IN_STEP_ON',
    hint: 'The stepping closeout starts on the same foot the run was on, so the crossfade does not sweep the legs. 0 = it started on its first frame wherever the run was.',
  },
  {
    id: 'hoops.hipSteerOn', label: 'Defense: hips turn toward the travel (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hipSteer.ts HIP_STEER_ON',
    hint: 'On defense the pelvis and legs turn toward where you are going while the chest stays on your man, so a diagonal slide or retreat steps along its travel. 0 = square hips, as before.',
  },
  {
    id: 'hoops.hipSteerAllLoopsOn', label: 'Defense: hips turn on every slide and run (0 = retreat and closeout only)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hipSteer.ts HIP_STEER_ALL_LOOPS_ON',
    hint: '0: the hips turn toward the travel only in the retreat and the closeout, where it measured better. 1: on every slide, crossover run and run too (it made a 3v3 bump slide more).',
  },
  {
    id: 'hoops.hipSteerMaxDeg', label: 'Defense: most the hips turn off the chest', def: 50, min: 0, max: 80, step: 5, unit: '°', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hipSteer.ts HIP_STEER_MAX_DEG',
    hint: 'The cap on the pelvis turn. Higher follows a diagonal further and twists the waist more.',
  },
  {
    id: 'hoops.hipSteerSec', label: 'Defense: hip turn ease', def: 0.14, min: 0, max: 0.5, step: 0.01, unit: 's', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hipSteer.ts HIP_STEER_SEC',
    hint: 'How fast the pelvis follows a change of direction. 0 = at once.',
  },
  {
    id: 'hoops.hipSteerFromMps', label: 'Defense: hip turn starts at', def: 0.8, min: 0, max: 3, step: 0.1, unit: 'm/s', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hipSteer.ts HIP_STEER_FROM_MPS',
    hint: 'No pelvis turn under this ground speed.',
  },
  {
    id: 'hoops.hipSteerFullMps', label: 'Defense: hip turn is full at', def: 1.8, min: 0.5, max: 5, step: 0.1, unit: 'm/s', group: 'Hoops · transitions',
    source: 'lib/babylon/anim/hipSteer.ts HIP_STEER_FULL_MPS',
    hint: 'All of the pelvis turn from this ground speed.',
  },
  // hoops-p05 (phase 5, the ball lives in the hand)
  {
    id: 'hoops.passFromHandOn', label: '3v3: a teammate pass leaves from the ball (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/hoops/ballHandoff.ts PASS_FROM_HAND_ON',
    hint: 'A teammate pass starts its flight where the ball is in his hands. 0 = it started at his chest height over his feet, wherever the ball was: a jump out of the hand on the release.',
  },
  // hoops-p05b (phase 5): the pass lands on the receiver
  {
    id: 'hoops.passHomeOn', label: '3v3: a pass lands on the receiver (0 = off)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · transitions',
    source: 'lib/babylon/hoops/ballHandoff.ts PASS_HOME_ON',
    hint: 'A chest or bounce pass in flight bends onto where the receiver really is, so it arrives at his chest. Same flight time. 0 = it landed on the point it was aimed at, wherever he was, and the ball was drawn into his hand from up to 1.5 m away.',
  },
  // AF-1 (ANIM-FEEL-SPEC 2026-10-28): inertialized clip transitions, default OFF — off is the linear crossfade, unchanged.
  {
    id: 'anim.carryPushedBounce', label: 'Dunk runway dribble: pushed bounce on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/ballCarry.ts CARRY_PUSHED_BOUNCE_ON',
    hint: 'On: the dunk run-up dribble uses the pushed bounce the hoops modes use (the ball fastest at the floor, the hand meets it slowing). Off: the old bounce, fastest at the hand, which snapped the ball arm 35 to 60 degrees in a frame at every bounce.',
  },
  {
    id: 'anim.inertial', label: 'Inertial clip transitions on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_ON',
    hint: 'On: a clip switch cuts to the new clip at once and the old pose\'s difference decays out (no mid-blend pose). Takes effect on the next spawn.',
  },
  {
    id: 'anim.inertialHalfLifeK', label: 'Inertial offset half-life × fade time', def: 0.5, min: 0.1, max: 1.5, step: 0.05, unit: '×', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_HALF_LIFE_K',
    hint: 'How long the old pose takes to wash out, as a fraction of each clip switch\'s fade time. Only read when inertial transitions are on.',
  },
  // SWITCH-ON (2026-11-10): the inertial offset keeps the body's speed across a switch (Holden's v0 = v_old - v_new). Read only while anim.inertial is on.
  {
    id: 'anim.inertialMatchVel', label: 'Inertial: keep the speed across a switch on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_MATCH_VEL_ON',
    hint: 'On: the old pose\'s difference decays out starting at the speed the body had, minus the new clip\'s own speed, so a clip that starts fast (a strike) does not stack its speed on the old motion. Off: the first inertial version (one axis, the old speed only).',
  },
  {
    id: 'anim.inertialMinHalfLifeSec', label: 'Inertial: shortest half-life', def: 0.045, min: 0, max: 0.15, step: 0.005, unit: 's', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_MIN_HALF_LIFE_SEC',
    hint: 'A switch\'s old-pose offset never decays faster than this half-life (a 0.04 s fade gave 0.02 s: most of the offset went in one frame). 0 = the half-life × fade time alone. Read only while inertial transitions are on.',
  },
  {
    id: 'anim.inertialModesOn', label: 'Inertial transitions in karate, karate VS, showdown, mixed combat, duel, skateboard on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_MODES_ON',
    hint: 'On: those six modes use the inertial blend on the hero (the rig measured fewer hard pops in each). Off: the linear crossfade there, exactly as before. Every other mode follows the knob above. Takes effect on the next spawn.',
  },
  {
    id: 'anim.inertialAllBones', label: 'Inertial: every bone keeps its history on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_ALL_BONES_ON',
    hint: 'On: a switch onto a clip that moves a bone the last clip did not (guard to run: the legs) starts that bone from where it was. Off: the first inertial version, where those bones jumped in one frame (knee 32 to 62 degrees). Read only while inertial transitions are on.',
  },
  // GAMEPLAY-CLEAN-7 (2026-11-11): two more hero-only opt-ins, measured on the rig (GAMEPLAY-CLEAN-AUDIT section 4i), one knob each
  {
    id: 'anim.inertialFootballOn', label: 'Inertial transitions on the football runner on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_FOOTBALL_ON',
    hint: 'On: the football runner uses the inertial blend by default (the rig measured fewer hard pops). Off: the linear crossfade on the runner, exactly as before. Takes effect on the next spawn.',
  },
  {
    id: 'anim.inertialSurfOn', label: 'Inertial transitions on the surfer on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_SURF_ON',
    hint: 'On: the surfer uses the inertial blend by default (the rig measured fewer hard pops). Off: the linear crossfade on the surfer, exactly as before. Takes effect on the next spawn.',
  },
  // GAMEPLAY-CLEAN-7 (2026-11-11): the made-shot celebration's elbow swing re-keyed under a speed cap when the clip is built (the file untouched)
  {
    id: 'anim.celebrateEase', label: 'Made-shot celebration: arm swing eased on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/clipDesnap.ts CELEBRATE_EASE_ON',
    hint: 'On: the arms-up celebration after a made shot or a dunk turns the upper arms at most about 20 degrees a frame (its own capture swung them 28 to 32 degrees a frame as the elbows came out). Off: the clip exactly as captured. Takes effect on the next spawn.',
  },
  // GAMEPLAY-CLEAN-7 (2026-11-11): a dribble hand change crossfades linearly even on an inertial body
  {
    id: 'anim.inertialTwinLinear', label: 'Inertial: hand changes in the dribble crossfade on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_TWIN_LINEAR_ON',
    hint: 'On: when a basketball body switches the ball to the other hand, that one switch uses the plain crossfade even with inertial transitions on (the inertial one flipped both upper arms about 128 degrees in a frame). Off: the inertial switch there too. Only matters while inertial transitions are on for that body.',
  },
  // GAMEPLAY-CLEAN-7 (2026-11-11): the inertial blend finds a spawned body's hips (named Hips_c<n>) and carries their position too
  {
    id: 'anim.inertialHipsPos', label: 'Inertial: hip height carried across a switch on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_HIPS_POS_ON',
    hint: 'On: with inertial transitions, the hips height and sway ease into the new move like the rotations do. Off: the old behaviour, on every in-game body the hips jumped to the new move height in one frame (the blend looked for the hips by a name the spawned bodies do not have). Read only while inertial transitions are on.',
  },
  // GAMEPLAY-CLEAN-7 (2026-11-11): after a move that ran to its end, the bones the next clip does not move hold still (linear's behaviour)
  {
    id: 'anim.inertialEndedHold', label: 'Inertial: bones hold after a finished move on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/inertialize.ts ANIM_INERTIAL_ENDED_HOLD_ON',
    hint: 'On: when a hit react or knockdown has finished and the idle takes over, the legs the idle does not move stay where they are, as with the plain crossfade. Off: the old behaviour, they swung back to the rest pose (thighs up to 25 degrees a frame for about 20 frames). Read only while inertial transitions are on.',
  },
  // CLIP-SMOOTH (2026-11-03, owner: "Yes, smooth them"): the karate captures' own single-frame snaps re-keyed, default ON.
  // GAMEPLAY-CLEAN P3 (2026-11-03): the foot planter's leg solve eases in and out instead of stepping (anim/FootPlanting)
  {
    id: 'anim.plantEngageSec', label: 'Foot plant: solve blend time', def: 0.1, min: 0, max: 0.4, step: 0.02, unit: 's', group: 'Anim · transitions',
    source: 'lib/babylon/anim/FootPlanting.ts PLANT_ENGAGE_SEC',
    hint: 'How long the foot planter takes to take a leg over when it starts holding a foot, and to hand it back. 0 = the old one-frame step (the derby batter thigh jumped 25 degrees in a frame standing still).',
  },
  {
    id: 'anim.plantReleaseSec', label: 'Foot plant: release blend time', def: 0.1, min: 0, max: 0.4, step: 0.02, unit: 's', group: 'Anim · transitions',
    source: 'lib/babylon/anim/FootPlanting.ts PLANT_RELEASE_SEC',
    hint: 'How long a leg the foot planter lets go of takes to ease back onto the clip, in rotation. 0 = the old release, a target fade that rebuilt the leg in one frame when the body jumped or landed (football hurdle, 41 to 70 degrees a frame).',
  },
  {
    id: 'anim.plantReplantEase', label: 'Foot plant: a replant keeps easing on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/FootPlanting.ts PLANT_REPLANT_EASE_ON',
    hint: 'On: a foot that plants again while its leg is still easing off the last plant keeps easing. Off: the old behaviour, the leg snapped onto the new plant in one frame (a body sliding in a wide stance popped a thigh about 33 degrees at every re-plant).',
  },
  {
    id: 'anim.plantSeatedOff', label: 'Foot plant: off for a seated pilot on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/FootPlanting.ts PLANT_SEATED_OFF_ON',
    hint: 'On: a body its mode seats in a vehicle (the Aero Aces pilot) holds no foot plant. Off: the old behaviour, the seated feet were pinned to the ground as the plane flew and the knees snapped 50 to 60 degrees in a frame.',
  },
  {
    id: 'anim.fadeHoldEnded', label: 'Crossfade: hold a move that ends mid-blend on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/CharacterAnimator.ts FADE_HOLD_ENDED_ON',
    hint: 'On: a strike or hit react that reaches its last frame while it is still blending out is held on that frame until the blend ends. Off: the old behaviour, it vanished mid-blend and the whole body jumped in one frame (Showdown hit react into guard, arms about 30 degrees).',
  },
  {
    id: 'anim.hipYawFold', label: 'Posture hip strip folds past 90 degrees on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/PostureLayer.ts HIP_YAW_FOLD_ON',
    hint: 'On: a window that keeps part of the hips turn (football spin) reads a turn past 90 degrees folded back, so the hips never flip 180 degrees in a frame at the half-turn. Off: the old wrapped read.',
  },
  {
    id: 'anim.clipSmooth', label: 'Smooth the snaps inside clips on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Anim · clips',
    source: 'lib/babylon/anim/clipDesnap.ts CLIP_SMOOTH_ON',
    hint: 'On: a clip step that snaps a bone 25° or more in one frame is spread over the frames either side (the poses before and after kept). Off: the clips exactly as captured. Takes effect on the next spawn.',
  },  // CAMERA TIP (2026-10-29): the dunk contest's camera fixes (QA items 1-3, 8), default OFF — off is today's framing (2K High feel).
  {
    id: 'cam.dunkFraming', label: 'Dunk camera fixes on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Camera · dunk',
    source: 'lib/babylon/core/dunkCamFraming.ts CAM_DUNK_FRAMING_ON',
    hint: 'On: the phone slam cut pulls back and aims between the dunker and the rim, the reset camera stays out of the hoop and pole, the run-up camera sits higher and further back, and the phone idle view comes closer.',
  },
  // AF-11 (ANIM-FEEL-SPEC 2026-10-28): the shot holds its last frame (gather deferred to AF-11b) instead of wrapping, default OFF — off is the loop, unchanged.
  {
    id: 'anim.holdLast', label: 'Shot holds last frame on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Anim · transitions',
    source: 'lib/babylon/anim/basketballTree.ts ANIM_HOLD_LAST_ON',
    hint: 'On: the jumpshot freezes on its last frame while the shot lasts, instead of wrapping.',
  },
  // VENUE-SMOOTH-1 (2026-10-30): forge rivals on each crowd stand's front row, the Meshy bodies behind. Default OFF (PM).
  {
    id: 'crowd.forgeFront', label: 'Forge rivals in the crowd front row on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Crowd',
    source: 'lib/babylon/visual/crowd/crowdFront.ts CROWD_FORGE_FRONT_ON',
    hint: 'On: the front row of every stand is forge rivals (about 31k triangles each), the five Meshy fans sit behind. Off: the Meshy crowd in every row, no forge body loads. Read when the crowd bakes (next venue).',
  },
  // BAT-GRIP-2 (2026-11-10): the baseball bat is drawn only while both fists can be on it (modes/baseballBat.ts). NEW numbers.
  {
    id: 'baseball.batGripLostM', label: 'Bat hides when the fists are this far apart', def: 0.4, min: 0.25, max: 2, step: 0.05, unit: 'm', group: 'Baseball · bat',
    source: 'lib/babylon/modes/baseballBat.ts BAT_GRIP_LOST_M',
    hint: 'The bat is not drawn while the batter fists are further apart than this (the batter coming back to the stance from a run or a strikeout). 2 = never hides: the old behaviour, a bat strung between two far-apart hands.',
  },
  {
    id: 'baseball.batGripBackM', label: 'Bat comes back when the fists are this close', def: 0.3, min: 0.1, max: 0.4, step: 0.05, unit: 'm', group: 'Baseball · bat',
    source: 'lib/babylon/modes/baseballBat.ts BAT_GRIP_BACK_M',
    hint: 'A hidden bat is drawn again once the fists close to this. Lower = it appears later in the blend into the stance, with the hands nearer together.',
  },
  // VENUE-QUALITY v1 (box overlay 2026-10-31, switch-on 2026-11-03)
  {
    id: 'venue.veniceHoopsV1', label: 'Venice sand for 1v1 / 3v3 on (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Venue · quality',
    source: 'lib/babylon/scene/venueQualityV1.ts VQ',
    hint: 'On: 1v1, 3v3 and carnival use the dunk Venice boardwalk (sand, no kit palms / bushes / lawn tufts). Off: the lawn.',
  },
  {
    id: 'venue.iblEnvV1', label: 'Prefiltered .env sky light on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Venue · quality',
    source: 'lib/babylon/scene/venueQualityV1.ts VQ',
    hint: 'On: each mood lights from a prefiltered CC0 .env (public/env). Off: the procedural environment light.',
  },
  {
    id: 'venue.stageLmV1', label: 'AO-baked arena stage pieces on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Venue · quality',
    source: 'lib/babylon/scene/venueQualityV1.ts VQ',
    hint: 'On: mini-arena wall / column / statue / banner / block / gate load the AO-baked copies in public/models/props/mini-arena-lm-v1. Off: the originals.',
  },
  {
    id: 'venue.freezeV1', label: 'Freeze static venue meshes on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Venue · quality',
    source: 'lib/babylon/scene/venueQualityV1.ts VQ',
    hint: 'On: static venue meshes freeze their world matrices. Off: as before.',
  },
  // ── hoops-p06 (1v1 / 3v3 ten-phase pass, phase 6 "flow and pace") ──
  {
    id: 'hoops.boardBounceOn', label: 'Board race: the bounce decides (1) / the dice (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · flow and pace',
    source: 'lib/babylon/hoops/rebound.ts BOARD_BOUNCE_ON',
    hint: 'On: a swat, a block or a stalled board goes to the body nearest where the ball comes down (a seal and a jump that is up count). Off: distance plus a 2.6 m random term, as before.',
  },
  {
    id: 'hoops.boardTakeYM', label: 'Board race: the height a board is taken at', def: 2.4, min: 1.2, max: 3.4, step: 0.05, unit: 'm', group: 'Hoops · flow and pace',
    source: 'lib/babylon/hoops/rebound.ts BOARD_TAKE_Y_M',
    hint: 'The race is run to the spot where the ball next comes down to this height.',
  },
  {
    id: 'hoops.boardJumpEdgeM', label: 'Board race: a jump that is up is worth', def: 0.5, min: 0, max: 1.5, step: 0.05, unit: 'm', group: 'Hoops · flow and pace',
    source: 'lib/babylon/hoops/rebound.ts BOARD_JUMP_EDGE_M',
    hint: 'A body still in his jump when the race is called counts as this much nearer the ball.',
  },
  {
    id: 'hoops.replayCapSec', label: 'Big-play replay: longest on screen', def: 2.5, min: 0, max: 10, step: 0.1, unit: 's', group: 'Hoops · flow and pace',
    source: 'lib/babylon/court/hoopsMoments.ts REPLAY_CAP_SEC',
    hint: 'A dunk, block or ankle-breaker replay holds the game at most this long (the window around the moment). 0 = the old 4.8 to 10 s replay.',
  },
  // ── hoops-flow (owner 2026-11-12): the 3v3 game clock, and any press skips a replay ──
  {
    id: 'hoops.replaySkipOn', label: 'Replay: any press skips it (1) / buttons only (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · flow and pace',
    source: 'lib/babylon/core/replaySkip.ts REPLAY_SKIP_ON',
    hint: 'On: during a hoops replay (1v1, 3v3, the 3-point money ball, the dunk and duel cuts) a flick, a trigger, a stick push or a tap on the court skips it and the ball comes back; the press is not also a shot or a move. Off: only a button or d-pad press skips it, as before.',
  },
  {
    id: 'hoops.threeGameSec', label: '3v3 game clock', def: 240, min: 60, max: 600, step: 10, unit: 's', group: 'Hoops · flow and pace',
    source: 'lib/babylon/modes/threevthreeOvertime.ts THREE_GAME_SEC',
    hint: 'First to 21 or the leader when this clock runs out (a tie goes to overtime). Read when the game starts. 90 = the old clock.',
  },
  {
    id: 'hoops.rivalSizeUpSec', label: '1v1 rival: sizes you up at the top for', def: 4, min: 0, max: 8, step: 0.1, unit: 's', group: 'Hoops · flow and pace',
    source: 'lib/babylon/hoops/rivalOffense.ts RIVAL_SIZE_UP_SEC',
    hint: 'After the check he works you beyond the arc (probe moves, no commitment) this long before he attacks; a probe that beats you or a reach that misses sends him now. 0 = he attacks off the check, as before.',
  },
  {
    id: 'hoops.teamSizeUpSec', label: '3v3 rivals: the first touch sizes up longer by', def: 1.5, min: 0, max: 4, step: 0.1, unit: 's', group: 'Hoops · flow and pace',
    source: 'lib/babylon/hoops/teamOffense3v3.ts TEAM_SIZE_UP_SEC',
    hint: 'A fresh possession (not a swing catch) probes this much longer at the top, with one more probe move. The same lever as the 3v3 probe knob, first touch only. 0 = as before.',
  },
  {
    id: 'hoops.handChangeCatchLeadSec', label: 'Hand change: the catching hand reaches early by', def: 0.45, min: 0.06, max: 0.6, step: 0.01, unit: 's', group: 'Hoops · flow and pace',
    source: 'lib/babylon/anim/ballCarry.ts HAND_CHANGE_CATCH_LEAD_SEC',
    hint: 'On a dribble hand change the other hand starts to come and meet the ball this long before it catches it, instead of swinging to it in four frames. 0.06 = as before.',
  },
  {
    id: 'hoops.guardHandRestGapSec', label: 'Outside hand at rest: at most one cross per', def: 1.5, min: 0, max: 4, step: 0.1, unit: 's', group: 'Hoops · flow and pace',
    source: 'lib/babylon/modes/hoopsFlow.ts GUARD_HAND_REST_GAP_SEC',
    hint: 'Standing guarded, the automatic outside hand crosses the ball no more than once in this long (it crossed about once a second). On the move it is the rule as before. 0 = as before.',
  },
  {   // ── hoops-play (owner 2026-11-21: gameplay could still be improved greatly; docs/HOOPS-PLAY-AUDIT.md) ──
    id: 'hoops.rivalChaseBoardOn', label: '1v1 rival: goes and gets a loose board (1) / holds his seal (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · flow and pace',
    source: 'lib/babylon/hoops/boardChase.ts RIVAL_CHASE_BOARD_ON',
    hint: 'On: while a 1v1 rebound is loose the rival runs to the ball, as every 3v3 body already does. Off: he holds his box-out seal on your miss and crashes at a walk on his own, as before (a quarter of boards sat loose until the 4 s stall teleported both of you).',
  },
  {
    id: 'hoops.introPressPlaysOn', label: 'Opening intro: the press that skips it starts play at once (1) / after the camera hand-over (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · flow and pace',
    source: 'lib/babylon/court/mount/hoopsBroadcast.ts INTRO_PRESS_PLAYS_ON',
    hint: 'On: in 1v1 and 3v3 the first press that skips the broadcast intro moves you on the next frame while the camera eases back exactly as before. Off: the game waited for the whole 0.35 s camera hand-over, so the first stick press of every game moved you after 383 ms (later presses 33 ms).',
  },  // ── hoops-p08 (clean screen and phone budget, docs/HOOPS-AAA-GAP-SHOW.md) ──
  {
    id: 'hud.mcSubsWithVoice', label: 'MC subtitles while his voice plays: on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · screen',
    source: 'lib/babylon/ui/micSubtitles.ts MC_SUBS_WITH_VOICE',
    hint: 'Off: a line the MC is saying out loud shows no subtitle (the player can still turn subtitles on with CC; with the voice off the words always show). 1 = every line subtitled, as before.',
  },
  {
    id: 'hud.hintPlays', label: 'Control hint: shown for the first plays', def: 3, min: 0, max: 20, step: 1, unit: 'plays', group: 'Hoops · screen',
    source: 'lib/babylon/ui/hudHints.ts HINT_PLAYS',
    hint: 'The one-line control hint shows for this many plays of a mode in a session (a score, a shot or the next ball ends a play), then stops. 0 = always, as before.',
  },
  {
    id: 'venue.halfCourtCrowdCards', label: 'Flat cut-out crowd behind the 1v1 / 3v3 / 3-Point rim: on (1) / off (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · screen',
    source: 'lib/babylon/nexus/veniceBoardwalk.ts HALF_COURT_CROWD_CARDS',
    hint: 'Off: the twelve flat crowd cards stand only behind the dunk rim. 1 = also behind the half-court rim at Venice, as before.',
  },  {
    id: 'perf.phoneInkTrim', label: 'Phone: no ink line on hidden body parts (1) / every part (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/scene/phoneCasters.ts PHONE_INK_TRIM',
    hint: 'On a phone the contour line skips the eyes, the shoe soles, the socks and the accessories (each is inside a bigger part). Two draws a part. 0 = every part inked, as before.',
  },
  {
    id: 'perf.phoneSockCast', label: 'Phone: socks cast a shadow (1) / not (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/scene/phoneCasters.ts PHONE_SOCK_CAST',
    hint: 'On a phone the sock under the shoe stays out of the shadow map (its shadow is inside the leg). 1 = it casts, as before.',
  },
  {
    id: 'perf.phoneFarPropTex', label: 'Phone: parked bus, sedan and ball texture size (half court)', def: 512, min: 256, max: 1024, step: 256, unit: 'px', group: 'Hoops · phone budget',
    source: 'lib/babylon/scene/phoneTextureCap.ts PHONE_FAR_PROP_MAX',
    hint: 'In 1v1, 3v3 and 3-Point on a phone the far parked bus and sedan and the ball (24 cm: never 512 px on a phone) upload their maps at this edge. 1024 = as before.',
  },  {
    id: 'perf.propMergeOn', label: 'Venue props: one draw per material per model (1) / per part (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/visual/VenueProps.ts PROP_MERGE_ON',
    hint: 'A prop model whose parts share a material (the far pier: fifteen parts, two materials) is drawn as one mesh per material. Same picture. 0 = one draw per part, as before.',
  },  {
    id: 'venue.veniceLookV2', label: 'Venice hub: fences, benches, light poles, name boards, lit grounds (1) / V1 look (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/courtsDressing.ts VENICE_LOOK_V2',
    hint: 'The park furniture round the four courts (one draw each: merged fences and posts, thin-instanced benches and poles, one board atlas) and PBR grounds and sea. 0 = V1, with its floating name signs.',
  },  {
    id: 'venue.veniceLife', label: 'Venice hub: gulls, and watchers at the run on desktop (1) / an empty park (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/hubLife.ts VENICE_LIFE',
    hint: 'A few gulls over the sea (one thin-instanced draw; a phone flies half) and, on desktop and up only, people standing at Court 2 and by the other courts (the shipped crowd bodies). A phone gets no people: its crowd policy is cut-out cards. 0 = V1, an empty park.',
  },  {
    id: 'venue.venicePhoneWatchers', label: 'Venice hub: a few real people at the courts on a phone (1) / gulls only (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/hubLife.ts VENICE_PHONE_WATCHERS',
    hint: 'V2 (owner 2026-11-18): six real baked-animation people (the crowd bodies, never its cut-out cards) on a phone: four at the run, two by Court 1. 0 = a phone gets the gulls only.',
  },  {
    id: 'venue.veniceCourtLife', label: 'Venice hub: people shooting around and a jogger (1) / empty courts (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/courtLife.ts VENICE_COURT_LIFE',
    hint: 'V2, desktop and up: a shooter and a rebounder on Court 4 and on Court 1, and a jogger on the bike path. Shipped hoops clips; the ball arcs to the rim. A phone gets none (measured over its draw budget). 0 = no court life.',
  },  {
    id: 'venue.veniceCamCollide', label: 'Venice hub: the camera keeps out of poles, boards, palms, the boardwalk (1), the fences too (2) / passes through (0)', def: 0, min: 0, max: 2, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/courtsDressing.ts VENICE_CAM_COLLIDE',
    hint: 'V2: one invisible proxy of the park\'s solids and name boards that the shared camera\'s own occlusion probe pulls in on. No camera distance or lag changes. 2 adds the chain-link fences. Ships at 0 (reverted): the director\'s pull-in jumped 3.9 m in a frame to straight overhead at the boardwalk row, and swung off the player at a fence; easing it is a shared-camera change for the owner.',
  },  {
    id: 'venue.veniceSound', label: 'Venice hub: beach bed, far games, the run, footsteps (1) / the harness crowd bed only (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/hubSound.ts VENICE_SOUND',
    hint: 'The ocean bed, dribbles and shots from pickup games down the beach, the run cheering now and then near Court 2, and your steps (concrete vs sand). Through SoundKit: mute and volume apply. 0 = V1 (the mood crowd bed on first input).',
  },  {
    id: 'venue.veniceSolids', label: 'Venice hub: hoops, fences, benches, poles, palms and the boardwalk row are solid (1) / walk through (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/hubSolids.ts VENICE_SOLIDS',
    hint: 'Block pieces for the props round the courts (the movement sim\'s own wall rule; no movement number changes). The walk-up side of each fence stays open. 0 = V1, where the player walked through them.',
  },  {
    id: 'venue.walkupV2', label: 'Venice hub: the card on the court or in its ring, after a short dwell (1) / a 28 m box round the court (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/hubSolids.ts WALKUP_V2',
    hint: 'The court card comes up when you stand on the court or in its gold ring for a quarter second, and stays until you are a metre past. 0 = V1 (anywhere in a box round the court, behind its fence too, at once).',
  },  {
    id: 'venue.veniceWayfinding', label: 'Venice hub: first-visit hint, mini-map, Enter / X / Y on the card (1) / none (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/hubUi.ts VENICE_WAYFINDING',
    hint: 'A one-time line saying what to do, a small north-up map of the four courts with you on it, and keys for the card (Enter or X plays, Y plays with your party). 0 = V1.',
  },  {
    id: 'venue.storyDoor', label: 'Venice hub: the story gate east of the courts (1) / no gate (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/storyDoor.ts VENICE_STORY_DOOR',
    hint: 'A stone gate on the sand east of the courts: step into its ring and the card opens the story; the story says Back to Venice and lands you at the gate. 0 = no gate and no card.',
  },  {
    id: 'story.endCard', label: 'Story: the end card when a chapter finishes (1) / straight into the hub (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Story · flow',
    source: 'lib/babylon/adventure/story/progress.ts STORY_END_CARD',
    hint: 'When a chapter ends, a card says what it gave you and what comes next (or to be continued), with Keep exploring and the way out. 0 = the chapter ends straight into the hub, as before.',
  },  {
    id: 'story.foeFallBack', label: 'Story: a foe that falls out of the world goes back to its spawn (1) / falls for ever (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Story · flow',
    source: 'lib/babylon/adventure/world/story/runtime.ts STORY_FOE_FALL_BACK',
    hint: 'A camp monster or boss knocked off an edge is put back where it spawned, so the camp can still be cleared. 0 = it falls for ever and the camp never clears, as before.',
  },  {
    id: 'story.shutGateLine', label: 'Story: a hub gate that leads nowhere yet says so on the objective line (1) / says nothing (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Story · flow',
    source: 'lib/babylon/adventure/story/progress.ts STORY_SHUT_GATE_LINE',
    hint: 'In free roam, standing in a gate with no chapter behind it, the objective line reads This gate is still asleep. 0 = nothing on screen, as before.',
  },  {
    id: 'story.showDraftTags', label: 'Story: show the PLACEHOLDER and DRAFT tags for review (1) / players see plain words (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Story · flow',
    source: 'lib/babylon/adventure/story/shown.ts STORY_SHOW_DRAFT_TAGS',
    hint: 'The data keeps its PLACEHOLDER and DRAFT marks. At 0 players see the words plainly, with no tag or tag chip on the HUD, the dialogue box, the start screen or the end card. 1 = shown, for the owner to review the drafts.',
  },  {
    id: 'story.startProgress', label: 'Story: the start screen shows where you are and Continue (1) / Start and chapter 1 (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Story · flow',
    source: 'lib/babylon/adventure/story/progress.ts STORY_START_PROGRESS',
    hint: 'The start screen names the chapter and the step you stopped at, and its button says Continue (or Explore the hub once every chapter is played). 0 = Start and the first chapter title, as before.',
  },  {
    id: 'venue.coastDoor', label: 'Venice hub: the boat to the coast at the landing (1) / no boat (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/coastDoor.ts VENICE_COAST_DOOR',
    hint: 'A jetty and a boat west of the courts: step into its ring and the card takes the boat to the Coast and Islands; coming back lands you at the boat. 0 = no boat and no card.',
  },  {
    id: 'venue.deferScenery', label: 'Venice hub: paint and far scenery after you can move (1) / during the load (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/courtsView.ts VENICE_DEFER_SCENERY',
    hint: 'The hub loads the courts in their plain colour and you first; the painted courts, the palms and the boardwalk row arrive once you can walk. 0 = all of it during the load, as V1.',
  },  {
    id: 'perf.veniceSharedCourt', label: 'Venice hub: one court mesh for the four courts (1) / one per court (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/adventure/venice/courtsView.ts VENICE_SHARED_COURT',
    hint: 'The hub draws one court mesh at all four courts. Same picture. 0 = a mesh, material and detail map per court, as the prototype did (about 4 MB more on a phone, measured).',
  },  {
    id: 'perf.sharedGroundOn', label: 'Venice boardwalk: shared ground and sign materials (1) / one per plane (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/nexus/veniceBoardwalk.ts SHARED_GROUND_ON',
    hint: 'The tiled grounds share one painted tile per kind (tiling in the UVs) and the sands one grain; the aprons, sands, seas, surf strips, posts and flags are one mesh each. Same picture. 0 = a texture copy, a material and a draw per plane, as before.',
  },  {
    id: 'perf.phoneRailBodies', label: 'Phone: people on the boardwalk rail', def: 2, min: 0, max: 5, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/nexus/veniceBoardwalk.ts PHONE_RAIL_BODIES',
    hint: 'On a phone the half-court Venice rail (1v1, 3v3, 3-Point) keeps this many of its five onlookers, spread along it (two: the ends). Each is nine draw parts and about 10 MB of maps. 5 = all five, as before.',
  },  {
    id: 'perf.coveredSkyOff', label: 'Phone: drop the backdrop dome the court sky covers (1) / keep it (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/core/NexusVenue.ts COVERED_SKY_OFF',
    hint: 'On a phone the basketball courts drop the look stack backdrop dome and ring: the venue own opaque sky sphere sits inside them and hides them completely. Same picture. 0 = kept, as before.',
  },
  // ── lane/hoops-perf (owner 2026-11-12: join each body into one mesh; cut the heap churn) ──
  {
    id: 'perf.meterWgslOn', label: 'WebGPU try: the shot meter drawn by its WebGPU shader (1) / not drawn (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/visual/ShotMeter3D.ts METER_WGSL_ON',
    hint: 'Only under the owner WebGPU try (?engine=webgpu). 1 = the 3D shot meter has a WebGPU version of its shader. 0 = as before (missing under WebGPU). WebGL is the same either way.',
  },
  {
    id: 'perf.bodyMergeOn', label: 'Bodies: parts drawn by a few meshes (1 phone, 2 every tier) / one mesh per part (0)', def: 1, min: 0, max: 2, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/core/bodyMerge.ts BODY_MERGE_ON',
    hint: 'Every mode: once a body holds still, its parts that the renderer treats alike share one mesh (one sub-mesh per part, the same shaders, draw order and ink). Any change puts the parts back that frame. Same picture, fewer active meshes. 1 = the phone tier (measured identical there), 2 = every tier, 0 = one mesh per part, as before.',
  },
  // ── lane/hoops-followups (coordinator 2026-11-18: the 3v3 worst frame after the body merge was the first shadow bake at tip-off) ──
  {
    id: 'perf.shadowBakeAtStart', label: 'Phone shadows: the first bake at the START press (1) / after its full warm-up (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/scene/ShadowCache.ts SHADOW_BAKE_AT_START',
    hint: 'Every mode on the phone tier. The shadow cache watches the scene for a second after loading, then bakes the still scenery once. Pressing START before that second is up used to leave about a second of play drawing every shadow each frame, then the bake mid-play (the 3v3 worst frame). 1 = the press ends the watch and the bake happens on the first frame of play, under the intro camera. 0 = as before.',
  },
  // ── lane/kit-mac-jobs (owner 2026-11-18: the clothes look poofy; the two Blender jobs, the one-piece short and the new jerseys) ──
  {
    id: 'kit.onePieceShorts', label: 'Kit body short: one piece, fitted (1) / three pieces, as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Kit · garments',
    source: 'lib/babylon/core/kitGarmentSet.ts ONE_PIECE_SHORTS',
    hint: 'The kit bodies wear the one-piece court short made in Blender (a real crotch, fitted to the legs and seat) in place of the three-piece short whose legs crossed into each other. Applies to the next body loaded. 0 = the three-piece short.',
  },
  {
    id: 'kit.newJerseys', label: 'Kit body tops: the new basketball and football jerseys (1) / as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Kit · garments',
    source: 'lib/babylon/core/sportKitDefaults.ts NEW_JERSEYS',
    hint: 'The kit bodies carry the basketball jersey (the basketball modes default top) and the football jersey (in place of the Meshy football pack), both cut from the free MakeHuman tees and fitted close. Applies to the next body loaded. 0 = the tops as before.',
  },
  // ── hoops-p09 (1v1 / 3v3 phase 9 "one rulebook": the play audit's sinkers 2 to 6 and 10) ──
  {
    id: 'hoops.skillShotOn', label: 'Shots: the release decides (1) / a rate and a draw (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts SKILL_SHOT_ON',
    hint: 'On: a release inside the green goes in and one outside it misses; the contest and the distance shrink the green. Off: the grade sets a make rate and the ring draws, as before.',
  },
  {
    id: 'hoops.jumpGreenScale', label: 'Jump shot green: share of the old width', def: 1, min: 0.5, max: 1, step: 0.01, unit: 'x', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts JUMP_GREEN_SCALE',
    hint: 'The jumper and fadeaway green is this share of its old width. Ships at 1 (as before). The proposal to try: 0.62, about 70 ms on an open jumper. Finishes keep their own bars.',
  },
  {
    id: 'hoops.freeFinishContest', label: 'Finish: goes in untimed below this contest', def: 0.3, min: 0, max: 1, step: 0.05, unit: '', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts FREE_FINISH_CONTEST',
    hint: 'With the release deciding: a layup or other finish nobody is contesting this much goes in however it was timed. 0 = every finish needs the green.',
  },
  {
    id: 'hoops.finishContestNarrow', label: 'Finish: a full contest narrows its green by', def: 0.5, min: 0, max: 0.8, step: 0.05, unit: '', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts FINISH_CONTEST_NARROW',
    hint: 'With the release deciding: a contested layup or other finish has a narrower green, by this share at a full contest. 0 = only the meter narrowing.',
  },
  {
    id: 'hoops.aiSharedShotOn', label: 'AI shoots on the same meter (1) / its own table (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts AI_SHARED_SHOT_ON',
    hint: 'On: the 1v1 rival, the 3v3 rivals and your 3v3 teammates release on your meter with a hand per level, and the same rule decides. Off: their own make tables, as before.',
  },
  {
    id: 'hoops.aiTimingRookieMs', label: 'AI hand: ROOKIE timing spread', def: 100, min: 10, max: 150, step: 1, unit: 'ms', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts AI_TIMING_ROOKIE_MS',
    hint: 'How far off the green centre a ROOKIE release lands, typically (one standard deviation). Bigger = misses more.',
  },
  {
    id: 'hoops.aiTimingProMs', label: 'AI hand: PRO timing spread', def: 71, min: 10, max: 150, step: 1, unit: 'ms', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts AI_TIMING_PRO_MS',
    hint: 'The same for PRO (also staked, ranked and head-to-head runs).',
  },
  {
    id: 'hoops.aiTimingEliteMs', label: 'AI hand: ELITE timing spread', def: 52, min: 10, max: 150, step: 1, unit: 'ms', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts AI_TIMING_ELITE_MS',
    hint: 'The same for ELITE.',
  },
  {
    id: 'hoops.aiTimingMateMs', label: 'AI hand: your 3v3 teammates timing spread', def: 71, min: 10, max: 150, step: 1, unit: 'ms', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts AI_TIMING_MATE_MS',
    hint: 'The same for your 3v3 teammates, at every difficulty.',
  },
  {
    id: 'hoops.moveReadOn', label: 'Moves and fakes: read the man (1) / a roll (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts MOVE_READ_ON',
    hint: 'On: a dribble move, the jab, the pump fake, the pass fake and off the head beat him only when he is off balance, coming at you or moving the wrong way (no roll); a set man holds. Off: the odds and the roll, as before.',
  },
  {
    id: 'hoops.moveLeanMps', label: 'Read: moving the wrong way faster than', def: 0.6, min: 0.2, max: 2, step: 0.05, unit: 'm/s', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts MOVE_LEAN_MPS',
    hint: 'A defender moving across you this fast, the other way from the move, is beaten by it.',
  },
  {
    id: 'hoops.moveCommitMps', label: 'Read: coming at you faster than', def: 1.4, min: 0.5, max: 4, step: 0.05, unit: 'm/s', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts MOVE_COMMIT_MPS',
    hint: 'A defender coming at you this fast has committed: a move, a jab or a pump fake beats him.',
  },
  {
    id: 'hoops.passFakeLaneCos', label: 'Pass fake: he bites when this square to the lane', def: 0.6, min: 0.2, max: 1, step: 0.05, unit: '', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts PASS_FAKE_LANE_COS',
    hint: 'With the read on: a pass fake moves a defender who stands at least this squarely in the lane to the man you showed.',
  },
  {
    id: 'hoops.gatherCloseoutOn', label: 'AI closes out on a jump shot gather (1) / holds (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts GATHER_CLOSEOUT_ON',
    hint: 'On: after his reaction time (ROOKIE 420, PRO 220, ELITE 120 ms) the man on you steps up when you gather for a jumper. Off: he holds his arm length spot, as before.',
  },
  {
    id: 'hoops.gatherCloseoutM', label: 'Closeout on the gather: steps up to', def: 0.8, min: 0.4, max: 1.4, step: 0.05, unit: 'm', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts GATHER_CLOSEOUT_M',
    hint: 'How far off the shooter the closeout on the gather finishes.',
  },
  {
    id: 'hoops.pressFloorOn', label: 'Dunk press never pays less than no press (1) / old table (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · one rulebook',
    source: 'lib/babylon/hoops/rulebook.ts PRESS_FLOOR_ON',
    hint: 'On: a showtime flush or a trick dunk pressed at the wrong moment goes in at least as often as not pressing. Off: early 42, late 50 against 70 untimed, as before.',
  },
  // ── hoops-sound (phase 11a, 2026-11-12): recorded CC0 sound beside the synths, the dribble heard, the pass heard ──
  {
    id: 'hoops.sampleSfxOn', label: 'Recorded sounds on (1) / synth only (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/samples.ts SAMPLE_SFX_ON',
    hint: 'On: in 1v1, 3v3 and 3-Point the swish, rim, squeak, cheer, crowd bed, dribble and catch play CC0 recordings. Off: every sound is the synth, as before.',
  },
  {
    id: 'hoops.dribbleSoundOn', label: 'Ball on the floor is heard (1) / silent (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/dribbleSound.ts DRIBBLE_SOUND_ON',
    hint: 'On: the ball is heard each time it hits the floor: every dribble (yours and the AI), a bounce pass, a rebound. Off: silent, as before.',
  },
  {
    id: 'hoops.dribbleSoundVol', label: 'Dribble: volume', def: 0.6, min: 0, max: 1.5, step: 0.05, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/dribbleSound.ts DRIBBLE_SOUND_VOL',
    hint: 'Your dribble at a full speed bounce. A softer bounce plays quieter, a hard pound louder.',
  },
  {
    id: 'hoops.dribbleSoundAiK', label: 'Dribble: AI handlers share', def: 0.5, min: 0, max: 1, step: 0.05, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/dribbleSound.ts DRIBBLE_SOUND_AI_K',
    hint: 'An AI dribble as a share of yours, so your ball stays the one you hear.',
  },
  {
    id: 'hoops.passCatchSoundOn', label: 'Pass is heard in the hands (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/dribbleSound.ts PASS_CATCH_SOUND_ON',
    hint: 'On: a 3v3 pass is heard in the hands when it is caught. Off: no catch sound, as before.',
  },
  {
    id: 'hoops.passCatchVol', label: 'Catch: volume', def: 0.7, min: 0, max: 1.5, step: 0.05, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/dribbleSound.ts PASS_CATCH_VOL',
    hint: 'How loud a caught pass is.',
  },
  // ── hoops-items (2026-11-18): three sound leftovers of hoops-sound, each NEW, its off value the sound as before (audio/hoopsSfx.ts)
  {
    id: 'hoops.passThrowQuietOn', label: 'Pass: no menu click on the throw (1) / the click as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/hoopsSfx.ts PASS_THROW_QUIET_ON',
    hint: 'On: a 3v3 pass is heard only in the hands that catch it (and a sling pass whooshes). Off: the throw plays the menu click, as before.',
  },
  {
    id: 'hoops.driftSqueakOn', label: 'Drift: a shoe squeak (1) / the net swish as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/hoopsSfx.ts DRIFT_SQUEAK_ON',
    hint: 'On: the DRIFT slide squeaks like the hardest cut. Off: it plays the net swish, as before.',
  },
  {
    id: 'hoops.glassSoundOn', label: 'Backboard kiss: its own sound (1) / the floor thud as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · sound',
    source: 'lib/babylon/audio/hoopsSfx.ts GLASS_SOUND_ON',
    hint: 'On: a banked ball off the glass sounds like a ball on a board. Off: it plays the body-on-the-floor thud, as before.',
  },
  // ── hoops-builder (owner 2026-11-12): what the five hoops ratings and the playing height change, casual runs only. Every band is
  //    the change at rating 90 (at 40 it moves the other way by a quarter of it); rating 50 is today at any band, and 0 = no effect.
  {
    id: 'hoops.ratingsOn', label: 'Hoops ratings change play (1) / everyone plays the same (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts RATINGS_ON',
    hint: 'Off: every athlete plays the standard numbers in every run, exactly as before the builder. Ranked, staked, arena, challenge and online runs are always standard.',
  },
  {
    id: 'hoops.rateSpeedBand', label: 'Speed 90: top speed and first step plus', def: 0.06, min: 0, max: 0.15, step: 0.01, unit: 'x', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts RATE_SPEED_BAND',
    hint: 'Share added to top speed (6.4 m/s) and acceleration at Speed 90.',
  },
  {
    id: 'hoops.rateHandleBand', label: 'Handle 90: handle points over the standard 50', def: 20, min: 0, max: 40, step: 1, unit: '', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts RATE_HANDLE_BAND',
    hint: 'The handle the moves read at Handle 90 is 50 plus this: each point is 0.0052 s more combo window and a tighter dribble. Moves stay unlocked for everyone.',
  },
  {
    id: 'hoops.rateReadBand', label: 'Handle 90: lean needed to beat a man, minus', def: 0.15, min: 0, max: 0.4, step: 0.01, unit: 'x', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts RATE_READ_BAND',
    hint: 'Share taken off the moving-the-wrong-way line (0.6 m/s) a move needs at Handle 90.',
  },
  {
    id: 'hoops.rateGreenBand', label: 'Shooting 90: jump shot green wider by', def: 0.1, min: 0, max: 0.25, step: 0.01, unit: 'x', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts RATE_GREEN_BAND',
    hint: 'Share added to the jump shot green at Shooting 90 (casual runs only).',
  },
  {
    id: 'hoops.rateFinishBand', label: 'Finishing 90: contest on a finish minus', def: 0.15, min: 0, max: 0.4, step: 0.01, unit: 'x', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts RATE_FINISH_BAND',
    hint: 'Share taken off the contest a defender puts on a layup or a dunk at Finishing 90.',
  },
  {
    id: 'hoops.rateSlideBand', label: 'Defense 90: slide speed plus', def: 0.06, min: 0, max: 0.15, step: 0.01, unit: 'x', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts RATE_SLIDE_BAND',
    hint: 'Share added to the defensive slide at Defense 90.',
  },
  {
    id: 'hoops.rateStealReachBand', label: 'Defense 90: steal reach plus', def: 0.05, min: 0, max: 0.15, step: 0.01, unit: 'x', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts RATE_STEAL_REACH_BAND',
    hint: 'Share added to the hero poke range (1.6 m) at Defense 90.',
  },
  {
    id: 'hoops.rateBlockReachM', label: 'Defense 90: block reach plus', def: 0.04, min: 0, max: 0.12, step: 0.01, unit: 'm', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts RATE_BLOCK_REACH_M',
    hint: 'Metres added to the block reach at Defense 90.',
  },
  {
    id: 'hoops.heightReachMPerIn', label: 'Playing height: reach per inch over the standard', def: 0.015, min: 0, max: 0.04, step: 0.001, unit: 'm', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts HEIGHT_REACH_M_PER_IN',
    hint: 'Metres of reach (the hero block reach and his release height against a block) per inch of playing height over the standard frame; under it, the same off.',
  },
  {
    id: 'hoops.heightLookPerIn', label: 'Playing height: drawn taller per inch over the standard', def: 0.01, min: 0, max: 0.01, step: 0.001, unit: 'x', group: 'Hoops · ratings',
    source: 'lib/babylon/hoops/ratings.ts HEIGHT_LOOK_PER_IN',
    hint: 'How much bigger the hero is drawn per inch of playing height (6ft 8 at 104 percent, 6ft 0 at 96). Drawing only, casual runs only. 0 = the standard body.',
  },
  // ── hoops-gather G1 (owner 2026-11-12, "good gathers and pick ups"; docs/HOOPS-GATHER-ESCAPE-PLAN.md): the pick-up reads the bounce ──
  {
    id: 'hoops.pickupReadOn', label: 'Pick-up reads the bounce (1) / takes it where it is (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/anim/ballCarry.ts PICKUP_READ_ON',
    hint: 'On: a shot pressed while the ball is low keeps it on its bounce and the hand goes down to meet it. Off: the ball flies up to a still hand, as before.',
  },
  {
    id: 'hoops.pickupWaitMaxSec', label: 'Pick-up: longest wait for the bounce', def: 0.2, min: 0.05, max: 0.35, step: 0.01, unit: 's', group: 'Hoops · gathers',
    source: 'lib/babylon/anim/ballCarry.ts PICKUP_WAIT_MAX_SEC',
    hint: 'The most the hand waits for a low ball to come up before it takes it as before.',
  },
  {
    id: 'hoops.pickupReachM', label: 'Pick-up: hand goes down to meet it by', def: 0.3, min: 0, max: 0.5, step: 0.01, unit: 'm', group: 'Hoops · gathers',
    source: 'lib/babylon/anim/ballCarry.ts PICKUP_REACH_M',
    hint: 'How far under the dribbling palm the hand reaches to meet the rising ball.',
  },
  {
    id: 'hoops.pickupRateMax', label: 'Pick-up: last bounce up to this much faster', def: 2, min: 1, max: 3, step: 0.1, unit: 'x', group: 'Hoops · gathers',
    source: 'lib/babylon/anim/ballCarry.ts PICKUP_RATE_MAX',
    hint: 'A harder last dribble so a low ball meets the hand inside the wait.',
  },
  {
    id: 'hoops.pickupRateFloorHz', label: 'Pick-up: at speed, count that from at least', def: 2, min: 0, max: 3, step: 0.1, unit: 'Hz', group: 'Hoops · gathers',
    source: 'lib/babylon/anim/ballCarry.ts PICKUP_RATE_FLOOR_HZ',
    hint: 'At a drive or a sprint the bounce slows to one a stride, so a low ball could not be met in time and was yanked up. 0 = count from that slow bounce (as at G2).',
  },
  {
    id: 'hoops.pickupTopGapM', label: 'Pick-up: take it at once within', def: 0.1, min: 0, max: 0.3, step: 0.01, unit: 'm', group: 'Hoops · gathers',
    source: 'lib/babylon/anim/ballCarry.ts PICKUP_TOP_GAP_M',
    hint: 'A ball this close to the top of its bounce is taken at once.',
  },
  {
    id: 'hoops.pickupContactM', label: 'Pick-up: taken when the ball is this close to the palm', def: 0.04, min: 0, max: 0.15, step: 0.01, unit: 'm', group: 'Hoops · gathers',
    source: 'lib/babylon/anim/ballCarry.ts PICKUP_CONTACT_M',
    hint: 'How near the palm (past the ball\'s radius) the rising ball must be to be taken.',
  },
  {
    id: 'hoops.pickupOverrunSec', label: 'Pick-up: extra time to rise to the hand', def: 0.1, min: 0, max: 0.2, step: 0.01, unit: 's', group: 'Hoops · gathers',
    source: 'lib/babylon/anim/ballCarry.ts PICKUP_OVERRUN_SEC',
    hint: 'When the hand did not get all the way down, the ball rises on to it for at most this long.',
  },
  {
    id: 'hoops.releaseSnapEaseSec', label: 'Release: wrist snap ease', def: 0.03, min: 0.01, max: 0.15, step: 0.01, unit: 's', group: 'Hoops · gathers',
    source: 'lib/babylon/anim/ballCarry.ts RELEASE_SNAP_EASE_SEC',
    hint: 'How smoothly the shooting wrist snaps through at the release. 0.03 = as before (it turns about 58 deg in one frame).',
  },
  {
    id: 'hoops.bufferFreshPressOn', label: 'Shot press: only a new press waits out a move (1) / a held one too (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/pressBuffer.ts BUFFER_FRESH_PRESS_ON',
    hint: 'On: a pump fake holds; press again to step through. Off (as before): the press that made the pump is replayed when it ends, so every pump steps through at once.',
  },
  {
    id: 'hoops.pumpBallHandOn', label: 'Pump fake: the ball stays in the hands (1) / back to the dribble at once (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/pumpHold.ts PUMP_BALL_HAND_ON',
    hint: 'On: the ball stays in the hands while the pump plays, and the step-through takes it from there. Off (as before): the dribble restarts the frame after the pump and the ball drops loose.',
  },
  {
    id: 'hoops.escapeReadOn', label: 'Step-back escape reads the man (1) / as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts ESCAPE_READ_ON',
    hint: 'On: a step-back beats a man on his heels or off balance (he is late), never a set man or one coming at you. Off: as before.',
  },
  {
    id: 'hoops.escapeRead3v3On', label: '3v3 step-back reads the man, his backpedal runs on (1) / reads nobody, as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts ESCAPE_READ_3V3_ON',
    hint: 'On: in 3v3 a step-back beats a man on his heels or off balance like 1v1, and he carries the backpedal he was in before he recovers. Off: as before.',
  },
  {
    id: 'hoops.escapeLateCarry', label: '3v3 step-back: a beaten man carries this share of his speed', def: 0.7, min: 0, max: 1, step: 0.05, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts ESCAPE_LATE_CARRY',
    hint: 'Through the late window the man the 3v3 step-back beat keeps backpedalling at this share of his speed. 0 = he brakes at once and stands.',
  },
  {
    id: 'hoops.trapReadOn', label: 'Trap: a cross splits an open gap, is stripped on the closed side (1) / as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts TRAP_READ_ON',
    hint: 'On: a crossover in a double team splits the two men when a body fits between them, and is a steal thrown into a man on the closed side (the owner rule). Off: as before.',
  },
  {
    id: 'hoops.escapeLateSec', label: 'Escape: a beaten man is late by', def: 0.7, min: 0.1, max: 1, step: 0.05, unit: 's', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts ESCAPE_LATE_SEC',
    hint: 'How long a defender who bit stays where the escape left him before he recovers.',
  },
  {
    id: 'hoops.trapGapMinM', label: 'Trap: extra room a split needs', def: 0, min: 0, max: 1, step: 0.05, unit: 'm', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts TRAP_GAP_MIN_M',
    hint: 'Beyond the room a body needs to pass between the two trappers (2.2 m apart). Tighter than that, the trap is shut.',
  },
  {
    id: 'hoops.escapeStripReachM', label: 'Trap: a cross into a man this close is stripped', def: 1.5, min: 0.8, max: 2.2, step: 0.05, unit: 'm', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts ESCAPE_STRIP_REACH_M',
    hint: 'A crossover thrown toward a trapper inside this, with the gap shut, is a steal (the owner rule).',
  },
  {
    id: 'hoops.trapSqueezeOn', label: 'Trap: the handler can squeeze between the two men (1) / the full body standoff (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts TRAP_SQUEEZE_ON',
    hint: 'On: a split lets the handler shoulder through two trappers about 1.6 m apart. Off: they must be 2.2 m apart.',
  },
  {
    id: 'hoops.trapSqueezeM', label: 'Trap squeeze: body to body through the gap', def: 0.8, min: 0.55, max: 1.1, step: 0.05, unit: 'm', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts SQUEEZE_STANDOFF_M',
    hint: 'How close the handler passes each trapper on a split (the trap must be twice this apart).',
  },
  {
    id: 'hoops.trapSqueezeSec', label: 'Trap squeeze: lasts', def: 0.6, min: 0.2, max: 1.2, step: 0.05, unit: 's', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/escapeRead.ts SQUEEZE_SEC',
    hint: 'How long after the split cross the handler can slip between the two men.',
  },
  {
    id: 'hoops.dunkGatherOn', label: 'Drive dunk: gather the ball, then go up (1) / up on the press (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/dunkGather.ts DUNK_GATHER_ON',
    hint: 'On: the press gathers the last dribble into the hands, then the plant and the take-off. Off: up on the press, the ball flown to the palm.',
  },
  {
    id: 'hoops.dunkGatherMaxSec', label: 'Drive dunk: longest gather before the take-off', def: 0.3, min: 0.1, max: 0.5, step: 0.05, unit: 's', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/dunkGather.ts DUNK_GATHER_MAX_SEC',
    hint: 'The take-off waits for the ball at most this long after the press.',
  },
  {
    id: 'hoops.pumpEndsDribbleOn', label: 'Pump fake ends the dribble (1) / dribble again after (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/hoops/response/pumpHold.ts PUMP_ENDS_DRIBBLE_ON',
    hint: 'On: after a pump the ball stays in the hands and the feet are set: shoot, pass or step through. Off: the dribble comes back when the pump ends.',
  },
  {
    id: 'hoops.comboDunkOn', label: 'Euro step and hop step can end in a dunk (1) / never (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · gathers',
    source: 'lib/babylon/core/ComboFinish.ts COMBO_DUNK_ON',
    hint: 'On: the turbo held, fast, and the last step inside dunk range, the euro or the hop takes off into a dunk. Off: they end in a layup or floater, as before.',
  },
  {
    id: 'hoops.comboDunkMinMps', label: 'Footwork dunk: fastest drive needed', def: 3.4, min: 2, max: 6, step: 0.1, unit: 'm/s', group: 'Hoops · gathers',
    source: 'lib/babylon/core/ComboFinish.ts COMBO_DUNK_MIN_MPS',
    hint: 'How fast the drive must be at the press for a euro or hop to become a dunk.',
  },
  // ── lane/kit-tight (owner 2026-11-18: "make the clothes appear to be skin tight and not baggy ... right now it looks poofy") ──
  {
    id: 'kit.inseamShade', label: 'One-piece short: darker inseam panel (0 = none)', def: 0.55, min: 0, max: 1, step: 0.05, unit: '', group: 'Kit · fit',
    source: 'lib/babylon/core/inseamShade.ts INSEAM_SHADE',
    hint: 'How much darker the cloth between the legs is, so its stretch in a stride reads as a gusset panel. 0 = as before (no panel).',
  },
  {
    id: 'kit.layerGap', label: 'Shorts kept under the top (metres; 0 = off)', def: 0, min: 0, max: 0.03, step: 0.001, unit: 'm', group: 'Kit · fit',
    source: 'lib/babylon/core/fitTight.ts LAYER_GAP',
    hint: 'Where the top covers the shorts, the shorts are held at least this far under it, so they never show through the top. 0 = as before (ships 0); 0.006 removes the dark marks on the new jersey lower back.',
  },
  {
    id: 'kit.setLiftScale', label: 'New garments: lift off the body (share of today)', def: 0.5, min: 0, max: 1, step: 0.05, unit: '', group: 'Kit · fit',
    source: 'lib/babylon/core/fitTight.ts SET_LIFT_SCALE',
    hint: 'Only the Blender-made one-piece short and new jerseys. 1 = today (13 mm tops, 20 mm shorts, plus the edge flare). Lower sits them closer to the body.',
  },
  {
    id: 'kit.fitTightness', label: 'Clothes fit: as before (0) to skin-tight (1)', def: 0, min: 0, max: 1, step: 0.05, unit: '', group: 'Kit · fit',
    source: 'lib/babylon/core/fitTight.ts FIT_TIGHTNESS',
    hint: 'How close the worn tee and shorts sit on the body. 0 = as before (about 3 cm off the skin). 1 = 8 mm off it everywhere but the hems, cuffs and leg openings.',
  },
  // ── coast-islands (2026-11-18, NEW): the Coast & Islands zone, phase A (docs/COAST-ISLANDS-PLAN.md). New behaviour only: no
  //    shipped number moves. coast.streamOn 0 is the measuring control (every piece at full detail), not a way to play.
  {
    id: 'coast.streamOn', label: 'Coast zone: stream the 64 m pieces (1) / draw every piece in full (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneView.ts COAST_STREAM_ON',
    hint: 'On: fine ground and every prop only round you, coarse ground and the tall props further out. Off: everything in full, the phone budget control.',
  },
  {
    id: 'coast.streamFull', label: 'Coast zone: full-detail ring (pieces)', def: 1, min: 0, max: 3, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneLayout.ts COAST_STREAM_FULL',
    hint: 'How many 64 m pieces out from yours are drawn in full. 1 = the 3 by 3 round you (the phone plan).',
  },
  {
    id: 'coast.streamLod', label: 'Coast zone: low-detail ring (pieces)', def: 2, min: 0, max: 5, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneLayout.ts COAST_STREAM_LOD',
    hint: 'Out to this many pieces the ground is coarse and only palms and sea stacks stand. 2 = the 5 by 5 (the phone plan).',
  },
  {
    id: 'coast.streamKeep', label: 'Coast zone: keep a piece this far past its ring', def: 1, min: 0, max: 2, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneLayout.ts COAST_STREAM_KEEP',
    hint: 'Hysteresis: a piece drops its detail only this many pieces after leaving its ring, so walking along an edge does not flicker.',
  },
  {
    id: 'coast.deepWaterTurnBack', label: 'Coast zone: deep water turns you back (1) / off (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneWorld.ts COAST_DEEP_WATER_TURN_BACK',
    hint: 'A jump that ends over water deeper than you can wade puts you back where you could stand. Off = the raw movement sim, for probes.',
  },
  // ── coast-b (2026-11-18, NEW): the Coast zone, phase B — the partner, the creatures, the log. No shipped number moves.
  {
    id: 'coast.partnerOn', label: 'Coast zone: one partner walks with you (1) / you walk alone (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zonePartner.ts COAST_PARTNER_ON',
    hint: 'Your Adventure partner follows you through the zone (a player with none gets the default creature on loan). Off = phase A.',
  },
  {
    id: 'coast.partnerCatchupM', label: 'Coast zone: partner catches up past', def: 24, min: 8, max: 64, step: 1, unit: 'm', group: 'Coast · zone',
    source: 'lib/adventure/coast/zonePartner.ts COAST_PARTNER_CATCHUP_M',
    hint: 'Left this far behind (you outrun it on a long sprint), the partner reappears a few steps behind you on your path.',
  },
  {
    id: 'coast.partnerStuckSec', label: 'Coast zone: a blocked partner comes back after', def: 1, min: 0.3, max: 5, step: 0.1, unit: 's', group: 'Coast · zone',
    source: 'lib/adventure/coast/zonePartner.ts COAST_PARTNER_STUCK_SEC',
    hint: 'A partner held up by something (a deck side, a rock) for this long, while more than 6 m behind, reappears on your path.',
  },
  {
    id: 'coast.creaturesOn', label: 'Coast zone: creatures live in the zone (1) / none (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneCreatures.ts COAST_CREATURES_ON',
    hint: 'The placeholder creatures wander near home and can be logged. Off = an empty zone, as in phase A.',
  },
  {
    id: 'coast.logSeenM', label: 'Coast zone: a creature is seen within', def: 16, min: 4, max: 40, step: 1, unit: 'm', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneCreatures.ts COAST_LOG_SEEN_M',
    hint: 'Coming this close puts a creature in your log as seen.',
  },
  {
    id: 'coast.logMeetM', label: 'Coast zone: a creature is met within', def: 3, min: 1, max: 8, step: 0.5, unit: 'm', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneCreatures.ts COAST_LOG_MEET_M',
    hint: 'Walking right up to a creature marks it as met in your log.',
  },
  // ── coast-d (2026-11-18, NEW): the Coast zone, phase D — the harbour town, the sports spots, the side quests.
  {
    id: 'coast.streamSliced', label: 'Coast zone: crossing into a piece spreads its building over frames (1) / does it all at once (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneView.ts COAST_STREAM_SLICED',
    hint: 'The fine ground of the pieces you walk into and the palms and rocks there arrive one job a frame (the coarse ground meanwhile), so a crossing is not one long frame. Off by default: no measured win on the rig; try on a real phone.',
  },
  {
    id: 'coast.zoneGrow', label: 'Coast zone: the four pieces past Reef Rock, the sandbank and Gull Key (1) / phase A zone (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneLayout.ts COAST_ZONE_GROW',
    hint: 'A 2 by 2 block of 64 m pieces north-west of Reef Rock: open sea, a sandbank you can wade from Reef Rock, and a small palm islet. 0 = the 6 by 6 zone of phases A to D.',
  },
  {
    id: 'coast.prewarmLate', label: 'Coast zone: compile the shaders of models that land after the load as they land (1) / on first sight (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneView.ts COAST_PREWARM_LATE',
    hint: 'The palms and rocks, the market and each townsperson: their shaders compile when they arrive, not on the frame you first see them mid-walk. Ships 0: on the rig it doubled the compile time and the worst frame was no better.',
  },
  {
    id: 'coast.townOn', label: 'Coast zone: the harbour town (1) / the bare beach (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneTown.ts COAST_TOWN_ON',
    hint: 'Houses, a market strip and townsfolk beside the dock. Off = phase B, and no quests.',
  },
  {
    id: 'coast.townsfolk', label: 'Coast zone: townsfolk in town', def: 4, min: 0, max: 4, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneTown.ts COAST_TOWNSFOLK',
    hint: 'Each is a full body with its own textures (a phone cost, measured). Fewer = fewer quest givers.',
  },
  {
    id: 'coast.townLoadAfterSec', label: 'Coast zone: seconds after you can move before the market and townsfolk load', def: 0.5, min: 0, max: 10, step: 0.5, unit: 's', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneTown.ts COAST_TOWN_LOAD_AFTER_SEC',
    hint: 'Keeps the two big town downloads out of the wait before you can move. 0 = load them with the zone.',
  },
  {
    id: 'coast.sportsOn', label: 'Coast zone: sports spots open their games (1) / none (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneTown.ts COAST_SPORTS_ON',
    hint: 'Surf, beach volleyball, golf and the kart, one tap each, and back to the same spot after.',
  },
  {
    id: 'coast.questsOn', label: 'Coast zone: townsfolk give quests (1) / only say hello (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneQuests.ts COAST_QUESTS_ON',
    hint: 'Three small quests, saved with your Adventure progress.',
  },
  // ── lane/kit-numbers (2026-11-19): the player's number and name printed on the new court jerseys ──
  {
    id: 'kit.jerseyDecals', label: 'Court jerseys: print the number and name (1) / blank (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Kit · fit',
    source: 'lib/babylon/core/jerseyDecals.ts JERSEY_DECALS',
    hint: 'On: the new basketball and football jerseys carry the player number on the chest and back and the name across the back. Off: a blank jersey, as before.',
  },
  // ── lane/improve-hoops-2 (2026-11-22, docs/IMPROVE-10-PHASE-AUDIT.md phase 3): the bodies' clips, built faster at load ──
  {
    id: 'perf.poseClipFast', label: 'Load: a solved arm or leg recomputes only that limb (1) / the whole body (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/anim/poseClip.ts POSE_CLIP_FAST',
    hint: 'How the bodies build their moves while a game loads. The moves come out the same either way; on is faster. Off: as before.',
  },
  {
    id: 'perf.poseClipShare', label: 'Load: bodies with the same build share their solved moves (1) / each solves its own (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/anim/poseClip.ts POSE_CLIP_SHARE',
    hint: 'A second body with the same skeleton copies the first one\'s moves instead of working them out again. Off: every body works out its own, as before.',
  },
  {
    id: 'perf.onlookerClipsOnly', label: 'Load: people watching build only their idle and cheer (1) / every move (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · phone budget',
    source: 'lib/babylon/visual/onlookerClips.ts ONLOOKER_CLIPS_ONLY',
    hint: 'The crowd on the rail only ever stands and cheers, so on it skips building the rest. They look the same. Off: as before.',
  },
  // ── lane/improve-hoops-2 (2026-11-22, phase 4): hoops rules, one way in both modes ──
  {
    id: 'hoops.makeBeatHoldsShot', label: '1v1: no shot in the beat after your make (1) / a shot can start (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · rules',
    source: 'lib/babylon/hoops/oneRule.ts MAKE_BEAT_HOLDS_SHOT',
    hint: 'After you score, the ball is yours under the rim for a moment before the check. On: a shot pressed then waits for the check. Off: it went up and could not count.',
  },
  {
    id: 'hoops.rivalChaseAroundBody', label: '1v1 rival: chase a loose ball round a body in the way (1) / straight at it (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · rules',
    source: 'lib/babylon/hoops/boardChase.ts RIVAL_CHASE_AROUND_BODY',
    hint: 'When someone stands between him and a rebound and he makes no ground for half a second, he steps round them. Off: he keeps pushing straight.',
  },
  {
    id: 'hoops.driveByHandOn', label: '3v3: the drive-by steal must reach the ball (1) / any pass-by poke (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · rules',
    source: 'lib/babylon/hoops/steals.ts DRIVE_BY_HAND_ON',
    hint: 'Your feel call. On: running past the driver with a poke only steals if your hand can get to his ball, like any poke. Off: as shipped.',
  },
  {
    id: 'hoops.spinShotCutsHalf', label: 'Both modes: a shot can cut the spin from its half (1) / waits for the spin (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Hoops · rules',
    source: 'lib/babylon/hoops/oneRule.ts SPIN_SHOT_CUTS_HALF',
    hint: 'Your feel call. On: shoot in the second half of a spin and the shot goes at once, in 1v1 and 3v3 alike. Off: the shot waits for the spin to finish.',
  },
  // ── lane/improve-hoops-2 (2026-11-22, phase 10): online 3v3. NOTE: the session gate keeps overrides OFF in online runs, so the default is what plays ──
  {
    id: 'net.remoteOffence', label: 'Online 3v3: a friend on a seat passes and shoots with their own buttons (1) / the AI decides (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Online play',
    source: 'lib/net/knobs.ts NET_REMOTE_OFFENCE',
    hint: 'On: the body a friend plays brings the ball up, passes where they point and shoots when they press. Off: they move and defend, the AI picks the passes and shots.',
  },
  // ── lane/improve-screens (2026-11-22, docs/IMPROVE-10-PHASE-AUDIT.md phases 1, 2, 6): the game shell and the screens ──
  {
    id: 'ui.stageFitsHeader', label: 'Phone upright: the game takes the screen the header leaves (1) / sized for a one-row header (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Screens · phone',
    source: 'lib/ui/stageFit.ts STAGE_FITS_HEADER',
    hint: 'On: the stage reads the real height of the header above it, so the bottom of the game and the move stick stay on the screen. Off: the old 100dvh less 3.25rem box, which ran off the bottom of an upright phone.',
  },
  {
    id: 'ui.touchTargets44', label: 'Touch: Venice hint above the buttons, 44 px taps on the dunk chips, story SKIP, workout ticks (1) / as before (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Screens · phone',
    source: 'lib/ui/touchTargets.ts TOUCH_TARGETS_44',
    hint: 'On: the Venice first-visit hint sits under the mini-map, clear of DASH and JUMP; the dunk MIX, MC and CC chips, the story SKIP and choices and the workout tick boxes each get a tap box of at least 44 px (same look, same words). Off: each as before.',
  },
  {
    id: 'try.prefetchDunk', label: 'Try page: load the first dunk while the birth date is asked (1) / only after the answer (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Screens · phone',
    source: 'lib/try/prefetchDunk.ts TRY_PREFETCH_DUNK',
    hint: 'On: the dunk code and its first files are fetched into the browser cache while a guest gives the birth date (plain file requests, no cookies, nothing about the visitor). Off (shipped: the measured cut was about 12 percent, short of the 25 percent bar): nothing is requested until the answer, as before. The try page has no feel panel: change it by a commit.',
  },
  // ── lane/physics-arena (2026-11-23, owner: "a live physics play arena for the sport modes ... And POV"; docs/PHYSICS-ARENA-PLAN.md): all NEW ──
  {
    id: 'arena.on', label: 'Physics Arena chip on Play (1) / hidden (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts ARENA_ON',
    hint: 'On: the Play screen shows the Physics Arena chip. Off: no chip; the arena still answers its own address.',
  },
  {
    id: 'arena.physicsHoops', label: 'Arena basketball on physics (1) / the shipped 1v1 (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts ARENA_PHYSICS_HOOPS',
    hint: 'On: the arena plays 1v1 with a real ball, rim and glass. Off: the arena hoops door opens the shipped 1v1.',
  },
  {
    id: 'cam.pov', label: 'Arena camera button gives first person POV (1) / the usual toggle (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Physics arena · POV',
    source: 'lib/babylon/arena/arenaConfig.ts CAM_POV',
    hint: 'On: SELECT or C in the arena switches to your own eyes and back. Off: the camera button does what it does elsewhere.',
  },
  {
    id: 'arena.stepHz', label: 'Arena physics steps a second', def: 120, min: 60, max: 240, step: 30, unit: 'Hz', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts ARENA_STEP_HZ',
    hint: 'More steps cost phone time; fewer let a fast ball skip further between checks.',
  },
  {
    id: 'arena.floorBounce', label: 'Arena ball bounce off the floor', def: 0.78, min: 0.5, max: 0.95, step: 0.01, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts FLOOR_BOUNCE',
    hint: 'Share of speed kept by a floor bounce. 0.78 passes the rule book drop test.',
  },
  {
    id: 'arena.rimBounce', label: 'Arena ball bounce off the iron', def: 0.55, min: 0.2, max: 0.9, step: 0.01, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts RIM_BOUNCE',
    hint: 'Lower is a softer rim: more rattles go in.',
  },
  {
    id: 'arena.boardBounce', label: 'Arena ball bounce off the glass', def: 0.62, min: 0.3, max: 0.9, step: 0.01, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts BOARD_BOUNCE',
    hint: 'Share of speed kept off the backboard.',
  },
  {
    id: 'arena.jumpVy', label: 'Arena jump shot take-off speed', def: 3.1, min: 2, max: 4.5, step: 0.05, unit: 'm/s', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts JUMP_VY',
    hint: 'How high and how long the jump is: the top of it is the release that flies true.',
  },
  {
    id: 'arena.shotArcDeg', label: 'Arena shot launch angle', def: 52, min: 40, max: 65, step: 1, unit: '°', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts SHOT_ARC_DEG',
    hint: 'The arc the hand throws at. Higher drops in steeper.',
  },
  {
    id: 'arena.backspinRps', label: 'Arena shot backspin', def: 2.2, min: 0, max: 5, step: 0.1, unit: 'turns/s', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts BACKSPIN_RPS',
    hint: 'Spin the ball leaves with. More spin, softer off the iron.',
  },
  {
    id: 'arena.bodyCarry', label: 'Arena timing: share of the body rise or fall the ball keeps', def: 0.3, min: 0, max: 1, step: 0.05, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts BODY_CARRY',
    hint: 'The timing: let go rising and the shot goes long, falling and it goes short. 0 = timing never matters.',
  },
  {
    id: 'arena.runCompensate', label: 'Arena shot on the move: drift the hand cancels', def: 0.85, min: 0, max: 1, step: 0.05, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts RUN_COMPENSATE',
    hint: '1 = a moving shot flies like a still one. Lower, the drift carries the ball.',
  },
  {
    id: 'arena.releaseNoise', label: 'Arena hand scatter', def: 0.05, min: 0, max: 0.3, step: 0.01, unit: 'm/s', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts RELEASE_NOISE',
    hint: 'The tremor of a human hand on every throw.',
  },
  {
    id: 'arena.aimAssist', label: 'Arena POV aim help', def: 0.8, min: 0, max: 1, step: 0.05, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts AIM_ASSIST',
    hint: 'POV only. 1 = every shot goes at the rim, 0 = exactly where you look.',
  },
  {
    id: 'cam.povEyeM', label: 'POV eye height when no head is found', def: 1.72, min: 1.4, max: 2.1, step: 0.01, unit: 'm', group: 'Physics arena · POV',
    source: 'lib/babylon/arena/arenaConfig.ts POV_EYE_M',
    hint: 'Where the eyes sit above the feet.',
  },
  {
    id: 'cam.povFovDeg', label: 'POV field of view across the screen', def: 82, min: 60, max: 110, step: 1, unit: '°', group: 'Physics arena · POV',
    source: 'lib/babylon/arena/arenaConfig.ts POV_FOV_DEG',
    hint: 'Wider sees more court, narrower feels closer.',
  },
  {
    id: 'cam.povBobM', label: 'POV head bob', def: 0, min: 0, max: 0.06, step: 0.005, unit: 'm', group: 'Physics arena · POV',
    source: 'lib/babylon/arena/arenaConfig.ts POV_BOB_M',
    hint: '0 = off, the default. Up and down with each stride when moving.',
  },
  {
    id: 'cam.povLookDegS', label: 'POV look speed', def: 150, min: 60, max: 360, step: 10, unit: '°/s', group: 'Physics arena · POV',
    source: 'lib/babylon/arena/arenaConfig.ts POV_LOOK_DEG_S',
    hint: 'How fast the right stick turns your view.',
  },
  {
    id: 'arena.dunks', label: 'Arena dunks and layups at the rim (1) / jump shots only (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts ARENA_DUNKS',
    hint: 'On: a run at the ring with the ball is a dunk the iron decides, a close shot a soft layup. Off: every shot a jump shot.',
  },
  {
    id: 'arena.physicsHands', label: 'Arena physics hands (1) / capsules only (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts ARENA_PHYSICS_HANDS',
    hint: 'On: every body has two solid hands that move where the hands are, so blocks and pokes happen by contact. Off (shipped until measured on a phone): the capsules and the old poke.',
  },
  {
    id: 'arena.dunkJumpVy', label: 'Arena dunk take-off speed', def: 4.3, min: 3, max: 5.5, step: 0.05, unit: 'm/s', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts DUNK_JUMP_VY',
    hint: 'How high a dunk goes: too low and the ball never gets over the ring.',
  },
  {
    id: 'arena.knockdowns', label: 'Arena knockdowns (1) / bodies only push (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts ARENA_KNOCKDOWNS',
    hint: 'On: a body run into hard enough goes down for a moment and drops the ball. Off (shipped until measured): bodies only push.',
  },
  {
    id: 'arena.fouls', label: 'Arena fouls called (1) / no whistle (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts ARENA_FOULS',
    hint: 'On: foul-speed contact is whistled by the shared referee rules (charge, blocking foul, shooting foul, loose-ball foul); the ball goes to the check.',
  },
  {
    id: 'arena.knockMps', label: 'Arena knockdown: the speed of the body running in', def: 5, min: 3, max: 9, step: 0.1, unit: 'm/s', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts KNOCK_MPS',
    hint: 'How fast a body must run into another to put it down (a sprint is 6, a jog 4.4). A body in the air goes down at 72% of it.',
  },
  {
    id: 'arena.downSec', label: 'Arena time on the floor after a knockdown', def: 1.3, min: 0.6, max: 3, step: 0.05, unit: 's', group: 'Physics arena',
    source: 'lib/babylon/arena/arenaConfig.ts DOWN_SEC',
    hint: 'How long a knocked-down body is out of the play, the get-up included.',
  },
  {
    id: 'arena.xpOn', label: 'Arena games count for XP and progress (1) / practice only (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Physics arena',
    source: 'lib/sessions/arenaScore.ts ARENA_XP_ON',
    hint: 'On: each finished game is posted and the server rebuilds its score from the plays, paying XP and progress (no Lab Credits). Off: a practice court.',
  },
  // ── lane/improve-world (2026-11-22, the 10-phase pass, phase 5): sound in the story and on the coast ──
  {
    id: 'story.sfxOn', label: 'Story: footsteps, hits, spells, the partner, camps, bosses and birds (1) / the wind bed and voices only (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Story · flow',
    source: 'lib/babylon/adventure/audio/storySfx.ts STORY_SFX_ON',
    hint: 'Sound effects from the shipped sound kit and three sounds made in code (no new files), driven by the story host\'s own events. Mute and volume apply. 0 = the story was silent in play but for the wind and the spoken lines, as before.',
  },
  {
    id: 'coast.oceanBed', label: 'Coast zone: the sea bed, waves, gulls and footsteps (1) / no bed asked for, so the stadium crowd plays (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/adventure/coast/zoneSound.ts COAST_OCEAN_BED',
    hint: 'The zone asks for the ocean bed in its load as Venice does, with waves on the nearest shore, a gull now and then and steps on sand, boards or in the shallows. 0 = the harness started its stadium crowd on the first press, as before.',
  },
  // ── lane/improve-world (phase 7): Chapter 1 looks finished ──
  {
    id: 'story.worldDressed', label: 'Story: textured ground and stone, edge trims, rail posts and the nature kit (1) / plain colour blocks (0)', def: 0, min: 0, max: 1, step: 1, unit: '', group: 'Story · flow',
    source: 'lib/babylon/adventure/world/dress.ts STORY_WORLD_DRESSED',
    hint: 'View only: no piece moves or changes size. The shipped ground textures on the tops, stone on the sides and blocks, a lip on each edge, a cap on each block, posts under the rails, and grass, bushes, rocks and trees from the shipped kit kept clear of where you play. 0 = the plain colours, as before. Ships OFF: on the phone rig it loaded 10 to 18 percent slower and drew World 1 slower; judge it on a real phone.',
  },
  // ── lane/improve-world (phase 9): the zone cameras ──
  {
    id: 'venue.camClearView', label: 'Coast and story camera: keeps out of the boat, houses, trees, rocks and walls (1) / passes through them (0)', def: 1, min: 0, max: 1, step: 1, unit: '', group: 'Coast · zone',
    source: 'lib/babylon/adventure/host/camera.ts VENUE_CAM_CLEAR_VIEW',
    hint: 'After the shared camera places itself, if a solid stands between you and it, or holds it, it comes in along its own line to just short of the solid. No camera distance, height, lag or FOV changes. 0 = the camera could end up inside the boat, as before.',
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
