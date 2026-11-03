// lib/teach/course.ts — EDU-02 (platform phase 10, 2026-11-03): a course any approved teacher can author.
//
// A COURSE is ordered lessons; a LESSON is ordered blocks; a BLOCK is one of:
//   card      a short text card (a title and up to the knowledge feed's fact length)
//   demo      an autoplaying avatar loop the library already plays (DEMO_CHOICES: read-only from lib/library/surfaceDemo.ts
//             and lib/education/lessonDemo.ts; never a borrowed movement — a teacher picks a loop by its name)
//   camera    a camera check on one of the Mirror's patterns (lib/education/lessonMovement.ts)
//   quiz      one question, 2–4 options, the answer and why
//   practice  a FEL game mode to practise in (EDU-03): opens the mode, reads the student's best score back. Never ranked,
//             staked or paid.
//   audio / video   held (OWN-16: no buckets yet). The validator refuses them until media storage exists.
//   book      the owner's book, by reference: one Playbook lesson (lib/education/course.ts), rendered from the book's own
//             data, never copied. Only the Playbook course uses it (playbookCourse.ts); a teacher's course cannot.
// Courses are FREE (OWN-06: selling shows "Opens soon" until Connect). Under-13 classes wait for counsel (OWN-11).
//
// THE VALIDATOR reuses the knowledge feed's limits (lib/knowledge/validate.ts LIMITS: a card fits one 390×844 screen) and
// screens every word through the claims screen (lib/share/screen.ts: conditions, treatment, guarantees) and the cue
// style's medical words (lib/cue-style/style.ts). A course that fails is not saved as published.
//
// Pure. Client-safe.
import { LIMITS } from '@/lib/knowledge/validate';
import { screenText, screenSummary } from '@/lib/share/screen';
import { isMedical } from '@/lib/cue-style/style';
import { drillDemoLoop } from '@/lib/library/surfaceDemo';
import { DRILLS } from '@/lib/drills/drills';
import { LESSON_DEMOS } from '@/lib/education/lessonDemo';
import { MOVEMENT_LABEL, type MirrorMovementId } from '@/lib/education/lessonMovement';

export type BlockKind = 'card' | 'demo' | 'camera' | 'quiz' | 'practice' | 'audio' | 'video' | 'book';
/** The kinds a teacher can add today (audio and video wait for media storage, OWN-16). */
export const LIVE_BLOCK_KINDS = ['card', 'demo', 'camera', 'quiz', 'practice'] as const satisfies readonly BlockKind[];
export const HELD_BLOCK_KINDS = ['audio', 'video'] as const satisfies readonly BlockKind[];

export interface CardBlock { id: string; kind: 'card'; title: string; text: string }
export interface DemoBlock { id: string; kind: 'demo'; clip: string }
export interface CameraBlock { id: string; kind: 'camera'; movement: MirrorMovementId }
export interface QuizBlock { id: string; kind: 'quiz'; question: string; options: string[]; answer: number; why: string }
export interface PracticeBlock { id: string; kind: 'practice'; mode: string; goal: string }
export interface MediaBlock { id: string; kind: 'audio' | 'video'; src: null }
/** One lesson of the owner's book, by its id (lib/education/course.ts lessonId: "<chapter>:<lessonKey>"). */
export interface BookBlock { id: string; kind: 'book'; lesson: string }
export type Block = CardBlock | DemoBlock | CameraBlock | QuizBlock | PracticeBlock | MediaBlock | BookBlock;

export interface CourseLesson { id: string; title: string; blocks: Block[] }
export type CourseStatus = 'draft' | 'published';
export interface Course {
  id: string;
  teacherId: string;
  title: string;
  summary: string;
  lessons: CourseLesson[];
  status: CourseStatus;
}

/** Course limits (new), on top of the feed's card limits. */
export const COURSE_LIMITS = { lessonsMax: 20, blocksMax: 12, summary: 240, goal: 120 } as const;

// ── what a block may point at ───────────────────────────────────────────────────────────────────────────────────────

export interface DemoChoice { clip: string; label: string }
/** The loops a teacher can show, by the movement's name: the Playbook drills' loops and the lessons' library loops. */
export const DEMO_CHOICES: readonly DemoChoice[] = (() => {
  const out: DemoChoice[] = [];
  const add = (clip: string | null, label: string) => { if (clip && !out.some((c) => c.clip === clip)) out.push({ clip, label }); };
  for (const d of DRILLS) add(drillDemoLoop(d.id), d.name);
  const LIB_LABEL: Record<string, string> = { ex_pogo: 'Pogo hop', ex_split_squat: 'Split squat', ex_bridge: 'Glute bridge', ex_pushup: 'Push-up' };
  for (const l of LESSON_DEMOS) if (l.source.kind === 'library') add(l.source.clip, LIB_LABEL[l.source.clip] ?? l.source.exercise.replace(/-/g, ' '));
  return out;
})();

export const CAMERA_CHOICES: readonly MirrorMovementId[] = ['squat', 'hinge', 'lunge', 'pushup', 'jump', 'screen'];
export const cameraLabel = (m: MirrorMovementId): string => MOVEMENT_LABEL[m];

/** Game modes a lesson can send a student to practise in (keys in lib/babylon/modes/registry.ts MODES; the test holds it). */
export const PRACTICE_MODES: readonly { mode: string; label: string }[] = [
  { mode: 'dunk', label: 'Dunk' }, { mode: 'sprint', label: 'Sprint' }, { mode: 'karate', label: 'Karate' },
  { mode: 'football', label: 'Football' }, { mode: 'skateboard', label: 'Skateboard' }, { mode: 'tennis', label: 'Tennis' },
  { mode: 'golf', label: 'Golf' }, { mode: 'penalty', label: 'Penalty' }, { mode: 'onevone', label: '1v1 Basketball' },
  { mode: 'dance', label: 'Dance' },
];
export const practiceLabel = (mode: string): string => PRACTICE_MODES.find((m) => m.mode === mode)?.label ?? mode;
/** Where a practice block opens its mode: the mode's own route (lib/curriculum/drillRoutes.ts's rule), never a challenge. */
export const practiceHref = (mode: string): string => `/play/${mode}`;

// ── the validator ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Every word a student would read in a block (for the screens). */
export function blockText(b: Block): string[] {
  switch (b.kind) {
    case 'card': return [b.title, b.text];
    case 'quiz': return [b.question, ...b.options, b.why];
    case 'practice': return [b.goal];
    default: return [];
  }
}

function textErr(errs: string[], where: string, s: unknown, max: number, optional = false): void {
  if (typeof s !== 'string' || !s.trim()) { if (!optional) errs.push(`${where}: empty`); return; }
  if (s.length > max) errs.push(`${where}: ${s.length} chars > ${max}`);
  if (/https?:\/\//i.test(s)) errs.push(`${where}: contains a link`);
}

/** The claims screen and the medical words over one piece of text: each problem as a line the teacher can act on. */
export function claimProblems(text: string, where: string): string[] {
  const out: string[] = [];
  const flags = screenText(text);
  if (flags.length) out.push(`${where}: ${screenSummary(flags)}`);
  else if (isMedical(text)) out.push(`${where}: medical words can't go in a lesson. Describe the movement instead.`);
  return out;
}

export function blockErrors(b: Block, where: string): string[] {
  const errs: string[] = [];
  if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !b.id) return [`${where}: a block needs an id`];
  switch (b.kind) {
    case 'card':
      textErr(errs, `${where}.title`, b.title, LIMITS.headline);
      textErr(errs, `${where}.text`, b.text, LIMITS.factText);
      break;
    case 'demo':
      if (!DEMO_CHOICES.some((c) => c.clip === b.clip)) errs.push(`${where}: pick a demo from the list`);
      break;
    case 'camera':
      if (!CAMERA_CHOICES.includes(b.movement)) errs.push(`${where}: pick a camera check from the list`);
      break;
    case 'quiz': {
      textErr(errs, `${where}.question`, b.question, LIMITS.question);
      const n = Array.isArray(b.options) ? b.options.length : 0;
      if (n < LIMITS.optionsMin || n > LIMITS.optionsMax) errs.push(`${where}.options: ${n}, want ${LIMITS.optionsMin}–${LIMITS.optionsMax}`);
      (b.options ?? []).forEach((o, i) => textErr(errs, `${where}.options[${i}]`, o, LIMITS.option));
      const norm = (b.options ?? []).map((o) => String(o).trim().toLowerCase());
      if (new Set(norm).size !== norm.length) errs.push(`${where}: two options are the same`);
      if (!Number.isInteger(b.answer) || b.answer < 0 || b.answer >= n) errs.push(`${where}: mark the right answer`);
      textErr(errs, `${where}.why`, b.why, LIMITS.why);
      break;
    }
    case 'practice':
      if (!PRACTICE_MODES.some((m) => m.mode === b.mode)) errs.push(`${where}: pick a game from the list`);
      textErr(errs, `${where}.goal`, b.goal, COURSE_LIMITS.goal);
      break;
    case 'audio':
    case 'video':
      errs.push(`${where}: ${b.kind} opens when media storage is set up`);
      break;
    case 'book':
      errs.push(`${where}: the book's own lessons are the Playbook course's; write a card instead`);
      break;
    default:
      errs.push(`${where}: unknown block kind ${String((b as { kind?: unknown }).kind)}`);
  }
  for (const t of blockText(b)) if (typeof t === 'string' && t.trim()) errs.push(...claimProblems(t, where));
  return errs;
}

/** Everything wrong with a course, for publishing. A draft may be saved with problems; a published course has none. */
export function courseErrors(c: Pick<Course, 'title' | 'summary' | 'lessons'>): string[] {
  const errs: string[] = [];
  textErr(errs, 'title', c.title, LIMITS.headline);
  textErr(errs, 'summary', c.summary, COURSE_LIMITS.summary);
  for (const [w, t] of [['title', c.title], ['summary', c.summary]] as const) if (typeof t === 'string' && t.trim()) errs.push(...claimProblems(t, w));
  const lessons = Array.isArray(c.lessons) ? c.lessons : [];
  if (!lessons.length) errs.push('a course needs at least one lesson');
  if (lessons.length > COURSE_LIMITS.lessonsMax) errs.push(`${lessons.length} lessons > ${COURSE_LIMITS.lessonsMax}`);
  const ids = new Set<string>();
  lessons.forEach((l, i) => {
    const at = `lesson ${i + 1}`;
    textErr(errs, `${at}.title`, l.title, LIMITS.headline);
    if (typeof l.title === 'string' && l.title.trim()) errs.push(...claimProblems(l.title, `${at}.title`));
    const blocks = Array.isArray(l.blocks) ? l.blocks : [];
    if (!blocks.length) errs.push(`${at}: add at least one block`);
    if (blocks.length > COURSE_LIMITS.blocksMax) errs.push(`${at}: ${blocks.length} blocks > ${COURSE_LIMITS.blocksMax}`);
    blocks.forEach((b, j) => {
      if (ids.has(b?.id)) errs.push(`${at} block ${j + 1}: duplicate id`);
      ids.add(b?.id);
      errs.push(...blockErrors(b, `${at} block ${j + 1}`));
    });
  });
  return errs;
}

/** A new block of a kind, with sensible empty fields (the authoring screen's "Add block"). */
export function newBlock(kind: (typeof LIVE_BLOCK_KINDS)[number], id: string): Block {
  switch (kind) {
    case 'card': return { id, kind, title: '', text: '' };
    case 'demo': return { id, kind, clip: DEMO_CHOICES[0]?.clip ?? '' };
    case 'camera': return { id, kind, movement: 'squat' };
    case 'quiz': return { id, kind, question: '', options: ['', ''], answer: 0, why: '' };
    case 'practice': return { id, kind, mode: PRACTICE_MODES[0].mode, goal: '' };
  }
}

/** A course read from storage or a request, with anything malformed dropped to its empty value (never thrown). */
export function cleanCourse(raw: unknown, fallback: Pick<Course, 'id' | 'teacherId'>): Course {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Course>;
  const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const lessons = (Array.isArray(r.lessons) ? r.lessons : []).slice(0, COURSE_LIMITS.lessonsMax).map((l, i) => ({
    id: str((l as CourseLesson)?.id, 64) || `l${i + 1}`,
    title: str((l as CourseLesson)?.title, 200),
    blocks: (Array.isArray((l as CourseLesson)?.blocks) ? (l as CourseLesson).blocks : []).slice(0, COURSE_LIMITS.blocksMax).filter((b) => b && typeof b === 'object') as Block[],
  }));
  return { id: fallback.id, teacherId: fallback.teacherId, title: str(r.title, 200), summary: str(r.summary, 600), lessons, status: r.status === 'published' ? 'published' : 'draft' };
}
