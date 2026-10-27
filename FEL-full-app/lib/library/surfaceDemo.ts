// lib/library/surfaceDemo.ts — T-POSE (owner playtest, 2026-10-27): what the 3D demo plays on the surfaces outside the
// library — the Mirror's Quick Screen results, Today's drill and the drills app (each through its drill-demo.tsx).
//
// Before this they mounted components/coach/exercise-avatar-canvas.tsx: elijah.glb, whose ONE clip is an unrelated 23.9 s
// capture ("My Movie 195"; the clip names the canvas asked for — jump_up, run_forward, idle_stand — are not in the file,
// measured), played for every drill, the arms swinging from 12° to 171° off hanging, framed so the head was off the
// canvas. Now every surface plays through the library stage (the player's own avatar, the authored loops measured on
// every body), and a drill plays a loop only where one IS its movement; otherwise the body stands still in the start
// position, labelled "Demo coming" — never a T-pose, never another movement.
//
// Pure. Client-safe.

/** A drill (lib/drills/drills.ts DRILLS id) → the authored loop that shows its movement. null: no loop is its movement. */
export const DRILL_DEMO_LOOPS: Readonly<Record<string, string | null>> = {
  'pogo-bilateral': 'ex_pogo',
  // assumption: the one-foot progression alternates feet set by set; the loop shows one foot's set
  'pogo-unilateral': 'ex_pogo_sl',
  // assumption: a countermovement jump and a soft, held landing (the drill holds three seconds; the loop lands and resets)
  'safe-landing': 'ex_jump',
  'lateral-bound': 'ex_lateral_bound',
  // DEMO-LOOPS: its six phases in order, one beat each (breath, hip circle, pogos, the launch)
  'wake-up': 'ex_wake_up',
  // DEMO-LOOPS (2026-10-27): authored for the drill (anim/authored/exerciseDrills.ts)
  'countermovement-geometry': 'ex_cmj_dip',
  'wall-drive': 'ex_wall_drive',
  'three-step-decel': 'ex_decel_three',
  't-drill': 'ex_t_drill',
  'approach-one-foot': 'ex_approach_one',
  'approach-two-foot': 'ex_approach_two',
};

/** A Quick Screen test (lib/screen/copy.ts SCREEN_TEST_NAMES) → its loop: the overhead squat, the knee-to-wall ankle
 *  bend, the partial single-leg squat and the hands-on-hips jump. */
export const SCREEN_DEMO_LOOPS: Readonly<Record<'T1' | 'T2' | 'T3' | 'T5', string | null>> = {
  // DEMO-LOOPS (2026-10-27): each check authored as itself (anim/authored/exerciseDrills.ts)
  T1: 'ex_overhead_squat', T2: 'ex_knee_to_wall', T3: 'ex_sl_squat_partial', T5: 'ex_jump_hands_hips',
};

/** The still a surface with no loop shows: the body standing in the start position (held, not looping), "Demo coming". */
export const STILL_DEMO_CLIP = 'idle_stand';
export const DEMO_COMING = 'Demo coming';

/** The drill's loop, or null (the still). Unknown ids are the still too. */
export const drillDemoLoop = (id: string): string | null => DRILL_DEMO_LOOPS[id] ?? null;
