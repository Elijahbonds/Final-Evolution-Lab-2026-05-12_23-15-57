// lessonDemo — which Playbook lessons open on an autoplaying avatar demo, and which loop each one plays (PLAT-P04,
// 2026-10-27: "lessons that show before they tell").
//
// The owner's rules: autoplay, no extra taps; and never borrow a movement — no loop means no demo, and the lesson's step
// cards lead. So a lesson is listed here only when a loop IS the movement the book teaches in that lesson, reached one of
// four ways, all read-only:
//   · drill    a drill charted from this lesson (lib/drills/drills.ts) → its loop in lib/library/surfaceDemo.ts
//              DRILL_DEMO_LOOPS (the loop demo-loops authored for that drill);
//   · step     a phase of a charted drill whose source IS this lesson (the Pre-Game Wake-Up's six) → the loop authored for
//              that phase, surfaceDemo.ts WARMUP_DEMO_LOOPS (the coached warm-up plays the same one);
//   · library  a library exercise that is the lesson's movement (data/library, by id) → the loop the library itself plays
//              for that entry (lib/library/demo.ts demoClipFor). The loop is written here, because the library's data is
//              server-only; lessonDemo.test.ts loads the entry and holds the two equal, so the library stays the judge;
//   · lesson   the book's own sequence, which is neither a drill nor one library entry (the ankle's seated circles then the
//              knee-to-wall; the tripod, short foot and one-foot pogo of the Ankle Architecture Reset) → the loop
//              demo-loops authored for it, surfaceDemo.ts LESSON_DEMO_LOOPS.
//
// NOT LISTED, AND WHY: ch. 7 the partner-resisted march (no loop yet: queued for demo-loops in the lane report, never
// filled with a near miss). Chapter 3's checks are things you look at, standing still, and chapters 1 and 10 teach no
// movement: no demo is the right answer there. A concept that only explains (the pressure cylinder, the 7-minute unlock's
// summary) has no movement of its own.
//
// Pure data and two reads. Client-safe (surfaceDemo is pure and client-safe).

import { drillDemoLoop, lessonDemoLoop, warmupDemoLoop } from '@/lib/library/surfaceDemo';

export type LessonDemoSource =
  | { kind: 'drill'; drill: string }
  | { kind: 'step'; drill: string; step: string }
  | { kind: 'library'; exercise: string; clip: string }
  | { kind: 'lesson'; loop: string };

export interface LessonDemo {
  chapter: number;
  /** the lesson key (lib/education/course.ts slugify of the book's section title) */
  lesson: string;
  source: LessonDemoSource;
}

export const LESSON_DEMOS: readonly LessonDemo[] = [
  // ch. 2 — the foot. DEMO-LOOPS-8: the tripod and the short foot (the library's Short Foot Hold plays the Wake-Up's tripod
  // loop: the weight onto one foot, the arch drawn up and held for three); the Reset is the book's three steps on one foot
  // (assumption: one foot's run; the book repeats it on the other)
  { chapter: 2, lesson: 'the-foot-tripod', source: { kind: 'library', exercise: 'short-foot-hold', clip: 'ex_tripod' } },
  { chapter: 2, lesson: 'snack-the-ankle-architecture-reset', source: { kind: 'lesson', loop: 'ankle-architecture-reset' } },
  // ch. 4 — the three joints. The ankle: seated circles on the edge of a chair, then the knee-to-wall (one loop, both halves);
  // the hip: the 90/90 sit and its turn toward the front leg (assumption: "Joint 2 — The Hip" teaches through the 90/90
  // section that follows it, so both open on that loop); the thoracic spine: the quadruped rotation, a hand behind the head
  { chapter: 4, lesson: 'the-ankle', source: { kind: 'lesson', loop: 'ankle-circles-knee-to-wall' } },
  { chapter: 4, lesson: 'the-hip', source: { kind: 'lesson', loop: 'hip-90-90-turn' } },
  { chapter: 4, lesson: 'the-hip-90-90-position-mobility-home-base', source: { kind: 'lesson', loop: 'hip-90-90-turn' } },
  { chapter: 4, lesson: 'the-thoracic-spine', source: { kind: 'library', exercise: 'quadruped-thoracic-rotation', clip: 'ex_quad_t_rot' } },
  // ch. 5 — the whole 10-minute protocol is the Wake-Up drill, and its loop plays the phases in order
  { chapter: 5, lesson: 'the-10-minute-pre-game-protocol', source: { kind: 'drill', drill: 'wake-up' } },
  // Phase 5 is, in the book's words, "bilateral oscillatory pogos": the library's pogo hop is that movement
  { chapter: 5, lesson: 'build-the-rhythm', source: { kind: 'library', exercise: 'pogo-hop', clip: 'ex_pogo' } },
  // DEMO-LOOPS-8: the other five phases, each on the loop authored for it (the coached warm-up's own)
  { chapter: 5, lesson: 'release-the-locks', source: { kind: 'step', drill: 'wake-up', step: 'release-the-locks' } },
  { chapter: 5, lesson: 'pressurize-the-system', source: { kind: 'step', drill: 'wake-up', step: 'pressurize' } },
  { chapter: 5, lesson: 'wake-up-the-tripod', source: { kind: 'step', drill: 'wake-up', step: 'wake-the-tripod' } },
  { chapter: 5, lesson: 'open-the-joints', source: { kind: 'step', drill: 'wake-up', step: 'open-the-joints' } },
  { chapter: 5, lesson: 'prime-the-launch', source: { kind: 'step', drill: 'wake-up', step: 'prime-the-launch' } },
  // ch. 6 — jumping and landing
  { chapter: 6, lesson: 'the-countermovement-geometry-check', source: { kind: 'drill', drill: 'countermovement-geometry' } },
  { chapter: 6, lesson: 'the-oscillatory-pogo-progression', source: { kind: 'drill', drill: 'pogo-bilateral' } },
  { chapter: 6, lesson: 'weeks-1-2-bilateral-pogos', source: { kind: 'drill', drill: 'pogo-bilateral' } },
  { chapter: 6, lesson: 'weeks-3-4-unilateral-pogos', source: { kind: 'drill', drill: 'pogo-unilateral' } },
  // assumption (surfaceDemo's own): the safe-landing loop is a countermovement jump with a soft, held landing
  { chapter: 6, lesson: 'the-safe-landing-check', source: { kind: 'drill', drill: 'safe-landing' } },
  // ch. 7 — SAQ: each drill's loop was authored for it (anim/authored/exerciseDrills.ts)
  { chapter: 7, lesson: 'the-wall-drive', source: { kind: 'drill', drill: 'wall-drive' } },
  { chapter: 7, lesson: 'the-3-step-decel', source: { kind: 'drill', drill: 'three-step-decel' } },
  { chapter: 7, lesson: 'the-lateral-bound-and-stick', source: { kind: 'drill', drill: 'lateral-bound' } },
  { chapter: 7, lesson: 'the-t-drill', source: { kind: 'drill', drill: 't-drill' } },
  // ch. 8 — bodyweight strength. DEMO-LOOPS-8: the hip hinge is the book's bodyweight RDL, the hands sliding down the thighs
  // (no library entry is that hinge: the dowel and wall-tap hinges are their own drills)
  { chapter: 8, lesson: 'the-hip-hinge', source: { kind: 'lesson', loop: 'bodyweight-hip-hinge' } },
  // the rest through the library's own entry for each movement
  { chapter: 8, lesson: 'the-split-squat', source: { kind: 'library', exercise: 'split-squat', clip: 'ex_split_squat' } },
  { chapter: 8, lesson: 'the-glute-bridge', source: { kind: 'library', exercise: 'glute-bridge', clip: 'ex_bridge' } },
  { chapter: 8, lesson: 'glute-bridge-with-pressure-cylinder', source: { kind: 'library', exercise: 'glute-bridge', clip: 'ex_bridge' } },
  // assumption: the push-up loop shows the push-up; the scapular control the book adds is in the cards, not the loop
  { chapter: 8, lesson: 'the-push-up-with-scapular-control', source: { kind: 'library', exercise: 'pushups', clip: 'ex_pushup' } },
  { chapter: 8, lesson: 'scapular-controlled-push-up', source: { kind: 'library', exercise: 'pushups', clip: 'ex_pushup' } },
  // assumption: the plank loop holds the plank; the breathing the book adds is in the words, not the loop
  { chapter: 8, lesson: 'the-plank-with-breathing', source: { kind: 'library', exercise: 'plank', clip: 'ex_plank' } },
  { chapter: 8, lesson: 'breathing-plank', source: { kind: 'library', exercise: 'plank', clip: 'ex_plank' } },
  // ch. 9 — recovery
  { chapter: 9, lesson: 'legs-up-the-wall', source: { kind: 'library', exercise: 'legs-up-the-wall-breathing', clip: 'ex_pos_legsup' } },
  // DEMO-LOOPS-8: the one-knee supine twist is the library's Knee Across The Body (free-exercise-db: one leg long, the other
  // knee across, the head turned the other way)
  { chapter: 9, lesson: 'supine-spinal-twist', source: { kind: 'library', exercise: 'knee-across-the-body', clip: 'ex_knee_across' } },
  // assumption: the book's 4-6 breath lies on the back, a hand on the belly and one on the ribs; the library's supine belly
  // breathing is that position
  { chapter: 9, lesson: 'the-4-6-recovery-breath', source: { kind: 'library', exercise: 'supine-belly-breathing', clip: 'ex_pos_supine' } },
];

/** The loop a source plays, or null (a drill whose loop demo-loops has not made). */
export function clipOf(source: LessonDemoSource): string | null {
  switch (source.kind) {
    case 'drill': return drillDemoLoop(source.drill);
    case 'step': return warmupDemoLoop(source.step);
    case 'library': return source.clip;
    case 'lesson': return lessonDemoLoop(source.loop);
  }
}

/** The loop a lesson opens on (`<chapter>:<lessonKey>`, course.ts lessonId), or null: no demo, the step cards lead. */
export function demoForLesson(lessonId: string): string | null {
  const m = /^(\d+):(.+)$/.exec(lessonId);
  if (!m) return null;
  const d = LESSON_DEMOS.find((x) => x.chapter === Number(m[1]) && x.lesson === m[2]);
  return d ? clipOf(d.source) : null;
}
