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
import { nameKey } from './search/text';

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
  // DEMO-LOOPS-6 (2026-11-03): platform P9's ball-skill drills (lib/drills/hoopsDrills.ts), done in place. The loops that ARE
  // the drill's movement: the one-hand form shot and the free throw's set shot (exerciseSignature.ts), the court's jab, pivot,
  // drop step, euro step, closeout and defensive slide (the library stage's hoops borrow), the jump stop; and four authored
  // for the drill (anim/authored/exerciseHoops.ts): the 1-2 step into the shot, the layup's steps, the rip-through, the rebound
  'hoops-form-shooting': 'ex_form_shot_one',
  'hoops-free-throw': 'ex_set_shot',
  'hoops-catch-and-shoot': 'ex_catch_shoot_12',
  'hoops-jab-series': 'bball_jab',
  'hoops-jump-stop': 'ex_jump_stop',
  'hoops-pivots': 'bball_pivot',
  'hoops-drop-step': 'bball_drop_step',
  'hoops-layup-footwork': 'ex_layup_steps',
  'hoops-euro-step': 'bball_euro_step',
  'hoops-rip-through': 'ex_rip_through',
  'hoops-closeout': 'bball_closeout',
  'hoops-defensive-slide': 'bball_defend_slide_left',
  'hoops-rebound': 'ex_rebound_chin',
};

/** A Quick Screen test (lib/screen/copy.ts SCREEN_TEST_NAMES) → its loop: the overhead squat, the knee-to-wall ankle
 *  bend, the partial single-leg squat and the hands-on-hips jump. */
export const SCREEN_DEMO_LOOPS: Readonly<Record<'T1' | 'T2' | 'T3' | 'T5', string | null>> = {
  // DEMO-LOOPS (2026-10-27): each check authored as itself (anim/authored/exerciseDrills.ts)
  T1: 'ex_overhead_squat', T2: 'ex_knee_to_wall', T3: 'ex_sl_squat_partial', T5: 'ex_jump_hands_hips',
};

/**
 * DEMO-LOOPS-4 (2026-11-03): FEL's generated warm-up and cool-down steps (lib/coach/warmup.ts WarmupStep ids, cooldown.ts
 * steps) → the loop that is the step: the Pre-Game Wake-Up's six phases (lib/drills/drills.ts WAKE_UP), the eight
 * rock-and-hold stretches and the thirteen primers (lib/coach/warmupContent.ts), and the cool-down's recovery breath (its
 * stretches are the rock-and-holds, same ids). These play in every coached session (lib/session-player/fromCoachToday.ts).
 * Every step has its own loop (anim/authored/exerciseWarmup.ts) or the library's loop that already IS it. surfaceDemo.test
 * holds the table to the generators' ids, so a new step without a row fails the suite.
 */
export const WARMUP_DEMO_LOOPS: Readonly<Record<string, string | null>> = {
  // the Wake-Up's phases
  'release-the-locks': 'ex_wall_locks', pressurize: 'ex_breathe_ribs', 'wake-the-tripod': 'ex_tripod', 'open-the-joints': 'ex_joint_circles',
  'build-the-rhythm': 'ex_pogo', 'prime-the-launch': 'ex_launch',
  // the rock-and-hold stretches (the warm-up's, and the cool-down's)
  'ankle-rock': 'ex_ankle_rock', 'wall-calf-rock': 'ex_wall_calf_rock', 'deep-squat-rock': 'ex_deep_squat_rock', 'hinge-rock': 'ex_hinge_rock',
  'ninety-ninety-rock': 'ex_ninety_rock', 'open-book-rock': 'ex_open_book_rock', 'kneeling-reach-rock': 'ex_kneeling_reach_rock', 'doorway-chest-rock': 'ex_doorway_chest_rock',
  // the primers
  'squat-jump-primer': 'ex_squat_jump_stick', 'fast-squat-primer': 'ex_fast_squat', 'broad-jump-primer': 'ex_broad_jump_stick', 'hip-snap-primer': 'ex_hip_snap',
  'split-hop-primer': 'ex_split_hop', 'split-drive-primer': 'ex_split_drive', 'fast-push-primer': 'ex_fast_pushup', 'fast-row-primer': 'ex_door_row',
  'tall-march-primer': 'ex_march', 'turn-stop-primer': 'ex_turn_stop', 'pogo-stick-primer': 'ex_pogo_stick', 'wall-drive-primer': 'ex_wall_drive',
  'squat-reach-primer': 'ex_squat_reach',
  // the cool-down's breath
  'recovery-breath': 'ex_breathe_supine',
};

/** A warm-up or cool-down step's loop, or null (the still). */
export const warmupDemoLoop = (id: string): string | null => WARMUP_DEMO_LOOPS[id] ?? null;

/**
 * DEMO-LOOPS-8 (2026-11-03): a Playbook lesson's own sequence, where the book's steps are neither a charted drill nor one
 * library entry (lib/education/lessonDemo.ts, source kind 'lesson') → the loop authored for it (anim/authored/
 * exerciseFamilies8.ts), keyed by the movement the lesson teaches.
 */
export const LESSON_DEMO_LOOPS: Readonly<Record<string, string | null>> = {
  // ch. 2: on one foot, the tripod set and the short foot held for three, twice; then the one-foot pogo
  'ankle-architecture-reset': 'ex_ankle_reset',
  // ch. 4: sitting on the edge of a chair, slow circles with one foot then the other; then up to the wall for the knee-to-wall
  'ankle-circles-knee-to-wall': 'ex_ankle_unlock',
  // ch. 4: the 90/90 sit, tall, the chest turning toward the front leg without either sit bone lifting
  'hip-90-90-turn': 'ex_ninety_turn',
  // ch. 8: the bodyweight RDL, the hands sliding down the thighs to the knees, the back flat, about 45°
  'bodyweight-hip-hinge': 'ex_bw_hinge',
};
/** A lesson sequence's loop, or null (the still). */
export const lessonDemoLoop = (id: string): string | null => LESSON_DEMO_LOOPS[id] ?? null;

/**
 * DEMO-LOOPS-4: coach catalogue rows the library cannot answer by name (lib/library/match.ts: no entry by that name or an
 * alias), keyed by the catalogue's exact name (folded by nameKey) → the loop that IS that row's movement, by the row's own
 * set-up (lib/coach/templateCatalogue.ts). Only names with no library entry: once the library has one, its own loop wins.
 */
export const CATALOGUE_DEMO_LOOPS: Readonly<Record<string, string>> = {
  // (Pike Push-Up left this table in DEMO-LOOPS-6: the library has its entry now — program-ask-2's — and plays its loop)
  // "Hold both sides of a sturdy door frame, … lean back … Pull your chest to the frame"
  'Door Frame Row, Upright': 'ex_door_row', 'Door Frame Row': 'ex_door_row',
};
const CATALOGUE_BY_KEY: ReadonlyMap<string, string> = new Map(Object.entries(CATALOGUE_DEMO_LOOPS).map(([n, c]) => [nameKey(n), c]));
/** A catalogue row's loop by its name, for a row the library has no entry for; null otherwise. */
export const catalogueDemoLoop = (name: string | null | undefined): string | null => (name ? CATALOGUE_BY_KEY.get(nameKey(name)) ?? null : null);

/** The still a surface with no loop shows: the body standing in the start position (held, not looping), "Demo coming". */
export const STILL_DEMO_CLIP = 'idle_stand';
export const DEMO_COMING = 'Demo coming';

/** The drill's loop, or null (the still). Unknown ids are the still too. */
export const drillDemoLoop = (id: string): string | null => DRILL_DEMO_LOOPS[id] ?? null;
