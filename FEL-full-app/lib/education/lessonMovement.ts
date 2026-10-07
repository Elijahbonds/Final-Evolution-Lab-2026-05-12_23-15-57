// lessonMovement — which Playbook lessons teach which Mirror movement. Pure data, no imports.
//
// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5: "learn it, then check it on camera". A lesson that teaches a
// movement the Mirror can read gets a "Check it on camera" link to /play/mirror?pattern=<movement>. It also replaces the
// EDUCATION-PILLAR-HOOK stub in lib/babylon/nexus/neuro-mirror/index.ts (loadLessonConfig), which resolves a lesson to a
// movement through this table.
//
// SHARED ON PURPOSE, EDITED BY NOBODY ELSE. The Mirror lane (Phase 2) reads `?pattern=` on /play/mirror; this file only
// says which id a lesson links to. Keep it a plain table so either lane can read it without importing the other's code.
// The movement ids are the Mirror's own: MIRROR_PATTERNS ids (lib/mirror/patterns.ts) and the harness's tabs ('jump',
// 'screen'). lib/education/lessonMovement.test.ts fails on an id the Mirror does not know, or a lesson the book lost.
//
// WHY THESE AND NO MORE. A lesson is mapped only when the book's own drill is the movement the Mirror reads:
//   ch. 3, the 5-Minute Movement Check  → 'screen'  (the Mirror's Movement Screen is these checks: knee window, hip
//                                                    level, rib angle, head float, single-leg stance — lib/mirror/screen.ts)
//   ch. 6, the countermovement and jump → 'jump'    (the Mirror's jump test)
//   ch. 8, Movement 1, the hip hinge    → 'hinge'   (lib/mirror/hingeAudit.ts)
//   ch. 8, Movement 2, the split squat  → 'lunge'   (lib/mirror/lungeAudit.ts reads a split stance from the front: the
//                                                    knee, the hip drop, the depth — assumption: the Mirror's lunge is the
//                                                    camera check for the book's split squat)
//   ch. 8, Movement 4, the push-up      → 'pushup'  (lib/mirror/pushupAudit.ts)
// Not mapped: the glute bridge, the plank, the SAQ drills, the landing drills — the Mirror has no check for them, and a
// link that opens a camera which cannot see the movement teaches the wrong thing.

/** A movement the Mirror can be asked to open on. */
export type MirrorMovementId = 'screen' | 'jump' | 'hinge' | 'lunge' | 'pushup' | 'squat';

export interface LessonMovement {
  chapter: number;
  /** The lesson key (lib/education/course.ts slugify of the book's section title). */
  lesson: string;
  movement: MirrorMovementId;
}

export const LESSON_MOVEMENTS: readonly LessonMovement[] = [
  { chapter: 3, lesson: 'the-5-checks', movement: 'screen' },
  { chapter: 3, lesson: 'the-knee-window', movement: 'screen' },
  { chapter: 3, lesson: 'the-hip-level-check', movement: 'screen' },
  { chapter: 3, lesson: 'the-rib-angle', movement: 'screen' },
  { chapter: 3, lesson: 'the-head-float', movement: 'screen' },
  { chapter: 3, lesson: 'the-single-leg-wobble-test', movement: 'screen' },
  { chapter: 6, lesson: 'how-a-jump-actually-works', movement: 'jump' },
  { chapter: 6, lesson: 'concept-1-the-countermovement-is-where-the-jump-', movement: 'jump' },
  { chapter: 6, lesson: 'the-countermovement-geometry-check', movement: 'jump' },
  { chapter: 8, lesson: 'the-hip-hinge', movement: 'hinge' },
  { chapter: 8, lesson: 'the-split-squat', movement: 'lunge' },
  { chapter: 8, lesson: 'the-push-up-with-scapular-control', movement: 'pushup' },
  { chapter: 8, lesson: 'scapular-controlled-push-up', movement: 'pushup' },
];

/** The Mirror page, opened on a movement. Reading `?pattern=` is the Mirror's (Phase 2); today it lands on the Mirror. */
export const MIRROR_PATH = '/play/mirror';

export function cameraHref(movement: MirrorMovementId): string {
  return `${MIRROR_PATH}?pattern=${encodeURIComponent(movement)}`;
}

/** The movement a lesson teaches, or null. `lessonId` is course.ts lessonId — `<chapter>:<lessonKey>`. */
export function movementForLesson(lessonId: string): MirrorMovementId | null {
  const m = /^(\d+):(.+)$/.exec(lessonId);
  if (!m) return null;
  const chapter = Number(m[1]);
  return LESSON_MOVEMENTS.find((x) => x.chapter === chapter && x.lesson === m[2])?.movement ?? null;
}

/** The movements a chapter teaches, in first-taught order, no repeats. */
export function movementsForChapter(chapter: number): MirrorMovementId[] {
  const out: MirrorMovementId[] = [];
  for (const x of LESSON_MOVEMENTS) if (x.chapter === chapter && !out.includes(x.movement)) out.push(x.movement);
  return out;
}

/** Every lesson that teaches `movement`, as `<chapter>:<lessonKey>` ids, in book order. */
export function lessonsForMovement(movement: string): string[] {
  return LESSON_MOVEMENTS.filter((x) => x.movement === movement).map((x) => `${x.chapter}:${x.lesson}`);
}

/** The words a "Check it on camera" link uses for each movement. */
export const MOVEMENT_LABEL: Record<MirrorMovementId, string> = {
  screen: 'Movement Screen',
  jump: 'Jump',
  hinge: 'Hip hinge',
  lunge: 'Split squat',
  pushup: 'Push-up',
  squat: 'Squat',
};
