// lessonDemo — which Playbook lessons open on an autoplaying avatar demo, and which loop each one plays (PLAT-P04,
// 2026-10-27: "lessons that show before they tell").
//
// The owner's rules: autoplay, no extra taps; and never borrow a movement — no loop means no demo, and the lesson's step
// cards lead. So a lesson is listed here only when the library already plays a loop that IS the movement the book teaches
// in that lesson, reached one of two ways, both read-only:
//   · drill    a drill charted from this lesson (lib/drills/drills.ts) → its loop in lib/library/surfaceDemo.ts
//              DRILL_DEMO_LOOPS (the loop demo-loops authored for that drill);
//   · library  a library exercise that is the lesson's movement (data/library, by id) → the loop the library itself plays
//              for that entry (lib/library/demo.ts demoClipFor). The loop is written here, because the library's data is
//              server-only; lessonDemo.test.ts loads the entry and holds the two equal, so the library stays the judge.
//
// NOT LISTED, AND WHY (the gaps are queued for demo-loops in the lane report, never filled with a near miss):
//   ch. 2 the Ankle Architecture Reset (the foot tripod, short foot) · ch. 4 the ankle (seated circles, then knee-to-wall:
//   the library's knee-to-wall loop shows only the second half), the hip 90/90, the quadruped thoracic rotation · ch. 5
//   each Wake-Up phase but the pogos (the protocol's loop plays all of them, so it opens the protocol lesson instead) · ch. 7 the
//   partner-resisted march · ch. 8 the hip hinge (the library's hinge loop is the loaded deadlift / RDL, not the hands-on-
//   thighs bodyweight hinge the book teaches) · ch. 9 the supine spinal twist (the library's twist rocks both knees; the
//   book draws one knee across). Chapter 3's checks are things you look at, standing still, and chapters 1 and 10 teach
//   no movement: no demo is the right answer there.
//
// Pure data and two reads. Client-safe (surfaceDemo is pure and client-safe).

import { drillDemoLoop } from '@/lib/library/surfaceDemo';

export type LessonDemoSource =
  | { kind: 'drill'; drill: string }
  | { kind: 'library'; exercise: string; clip: string };

export interface LessonDemo {
  chapter: number;
  /** the lesson key (lib/education/course.ts slugify of the book's section title) */
  lesson: string;
  source: LessonDemoSource;
}

export const LESSON_DEMOS: readonly LessonDemo[] = [
  // ch. 5 — the whole 10-minute protocol is the Wake-Up drill, and its loop plays the phases in order
  { chapter: 5, lesson: 'the-10-minute-pre-game-protocol', source: { kind: 'drill', drill: 'wake-up' } },
  // Phase 5 is, in the book's words, "bilateral oscillatory pogos": the library's pogo hop is that movement
  { chapter: 5, lesson: 'build-the-rhythm', source: { kind: 'library', exercise: 'pogo-hop', clip: 'ex_pogo' } },
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
  // ch. 8 — bodyweight strength, through the library's own entry for each movement
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
  // assumption: the book's 4-6 breath lies on the back, a hand on the belly and one on the ribs; the library's supine belly
  // breathing is that position
  { chapter: 9, lesson: 'the-4-6-recovery-breath', source: { kind: 'library', exercise: 'supine-belly-breathing', clip: 'ex_pos_supine' } },
];

/** The loop a source plays, or null (a drill whose loop demo-loops has not made). */
export function clipOf(source: LessonDemoSource): string | null {
  return source.kind === 'drill' ? drillDemoLoop(source.drill) : source.clip;
}

/** The loop a lesson opens on (`<chapter>:<lessonKey>`, course.ts lessonId), or null: no demo, the step cards lead. */
export function demoForLesson(lessonId: string): string | null {
  const m = /^(\d+):(.+)$/.exec(lessonId);
  if (!m) return null;
  const d = LESSON_DEMOS.find((x) => x.chapter === Number(m[1]) && x.lesson === m[2]);
  return d ? clipOf(d.source) : null;
}
