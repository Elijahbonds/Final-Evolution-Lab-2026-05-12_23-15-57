// PLAT-P10 (EDU-01, EDU-02, EDU-03, EDU-06): the teacher platform's rules, held.
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHAPTERS, lessonId } from '@/lib/education/course';
import { BookText } from '@/components/education/chapter-reader';
import { drillDemoLoop } from '@/lib/library/surfaceDemo';
import { DRILLS } from '@/lib/drills/drills';
import { LESSON_DEMOS } from '@/lib/education/lessonDemo';
import { teachDb } from '@/tests/helpers/teachDb';
import {
  CAMERA_CHOICES, DEMO_CHOICES, PRACTICE_MODES, courseErrors, newBlock, practiceHref, type Course,
} from './course';
import { checkApplication } from './apply';
import { pePlanErrors, GRADE_BANDS, type PePlan } from './pePlan';
import { PLAYBOOK_COURSE_ID, bookLesson, playbookCourse } from './playbookCourse';
import { canAuthor, isStoreCoachWith, isTeacher, teacherSource, type RoleDeps } from './role';
import { apply, decide, listCourses, me, newCourse, putCourse, queue, readCourse, checkPePlan, type TeachApiDeps } from './api';
import { resetTeachProbe } from './store';

const card = (id: string, title: string, text: string) => ({ id, kind: 'card' as const, title, text });
const goodCourse = (): Course => ({
  id: 'c1', teacherId: 't1', status: 'published', title: 'First steps in jumping', summary: 'Land softly, then jump higher.',
  lessons: [1, 2, 3].map((n) => ({
    id: `l${n}`, title: `Lesson ${n}`,
    blocks: [
      card(`c${n}`, 'Soft landings', 'Land on both feet, knees over toes, and hold it for a beat.'),
      { id: `d${n}`, kind: 'demo', clip: DEMO_CHOICES[0].clip },
      { id: `m${n}`, kind: 'camera', movement: 'squat' },
      { id: `q${n}`, kind: 'quiz', question: 'Where do the knees go?', options: ['Over the toes', 'Inside the big toe'], answer: 0, why: 'Over the toes keeps the landing stacked.' },
    ],
  })),
});

describe('the validator (EDU-02)', () => {
  it('a 3-lesson course with a card, a demo, a camera check and a quiz in each passes', () => {
    expect(courseErrors(goodCourse())).toEqual([]);
  });
  it.each([
    ['a condition (a diagnosis)', 'This fixes patellar tendinitis in a week.'],
    ['a guarantee', 'Guaranteed to add six inches to your vertical.'],
    ['treatment aimed at a body part', 'Use this to heal your knee after the game.'],
    ['a medical word', 'A protocol for patients after surgery.'],
  ])('rejects %s', (_, text) => {
    const c = goodCourse();
    (c.lessons[0].blocks[0] as { text: string }).text = text;
    const errs = courseErrors(c);
    expect(errs.some((e) => e.startsWith('lesson 1 block 1:'))).toBe(true);
  });
  it('control: plain coaching words pass', () => {
    const c = goodCourse();
    (c.lessons[0].blocks[0] as { text: string }).text = 'Push the floor away and stand tall at the top.';
    expect(courseErrors(c)).toEqual([]);
  });
  it('audio and video wait for media storage; a book block is the Playbook\'s only', () => {
    const c = goodCourse();
    c.lessons[0].blocks.push({ id: 'a', kind: 'audio', src: null }, { id: 'b', kind: 'book', lesson: '6:the-safe-landing-check' });
    const errs = courseErrors(c);
    expect(errs.some((e) => /audio opens when media storage/.test(e))).toBe(true);
    expect(errs.some((e) => /Playbook course's/.test(e))).toBe(true);
  });
  it('a demo is only a loop the library already plays (never borrowed), by its own name', () => {
    const known = new Set([...DRILLS.map((d) => drillDemoLoop(d.id)), ...LESSON_DEMOS.map((l) => (l.source.kind === 'library' ? l.source.clip : drillDemoLoop(l.source.drill)))].filter(Boolean));
    expect(DEMO_CHOICES.length).toBeGreaterThan(5);
    for (const c of DEMO_CHOICES) expect(known.has(c.clip), c.clip).toBe(true);
    const c = goodCourse();
    (c.lessons[0].blocks[1] as { clip: string }).clip = 'ex_not_a_loop';
    expect(courseErrors(c).some((e) => /pick a demo/.test(e))).toBe(true);
  });
  it('a practice block names a registered game mode and opens its own route (EDU-03)', () => {
    const registry = readFileSync('lib/babylon/modes/registry.ts', 'utf8');
    for (const m of PRACTICE_MODES) expect(registry, m.mode).toMatch(new RegExp(`\\n\\s+${m.mode}: `));
    expect(practiceHref('dunk')).toBe('/play/dunk');
    const c = goodCourse();
    c.lessons[0].blocks.push({ ...newBlock('practice', 'p1'), goal: 'Three clean takeoffs in a row.' } as never);
    expect(courseErrors(c)).toEqual([]);
  });
  it('every camera choice is one of the Mirror patterns the lessons use', () => {
    expect(CAMERA_CHOICES).toContain('squat');
  });
});

describe('the Playbook as the first course (reads the book, never retypes it)', () => {
  const course = playbookCourse();
  it('one course lesson per book lesson, titled by the book', () => {
    const book = CHAPTERS.flatMap((c) => c.lessons.map((l) => ({ id: lessonId(c.number, l.key), title: l.title })));
    expect(course.id).toBe(PLAYBOOK_COURSE_ID);
    expect(course.lessons.map((l) => ({ id: l.id, title: l.title }))).toEqual(book);
  });
  it('byte compare: each book block renders the book\'s own paragraphs, purpose and note', () => {
    let n = 0;
    for (const l of course.lessons) {
      const b = l.blocks.find((x) => x.kind === 'book') as { lesson: string };
      const found = bookLesson(b.lesson)!;
      const html = renderToStaticMarkup(createElement(BookText, { lesson: found.lesson, initiallyOpen: true }));
      for (const p of found.lesson.prose) {
        const esc = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
        expect(html.includes(esc), `${l.id}`).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });
  it('no sentence of the book is typed into the course file', () => {
    const src = readFileSync('lib/teach/playbookCourse.ts', 'utf8');
    for (const c of CHAPTERS) for (const l of c.lessons) for (const p of l.prose) {
      const piece = p.slice(0, 40);
      if (piece.length >= 30) expect(src.includes(piece), piece).toBe(false);
    }
  });
});

describe('the application (EDU-01)', () => {
  const good = { discipline: 'jump', bio: 'I coach high-school jumpers and have for eight years, mostly on landing mechanics.', sample: 'Today we land before we jump. Stand tall, drop softly, and freeze the landing for three seconds.', links: ['https://example.com/me'] };
  it('a clean application passes; every problem comes back at once', () => {
    expect(checkApplication(good).ok).toBe(true);
    const bad = checkApplication({ discipline: 'x', bio: 'short', sample: 'Guaranteed results. This cures back pain.', links: ['http://plain'] });
    expect(bad.ok).toBe(false);
    expect((bad as { errors: string[] }).errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('PE lesson plan format (EDU-06)', () => {
  const plan = (band: PePlan['band']): PePlan => ({
    title: 'Landing and stopping', band,
    parts: {
      warmUp: { minutes: 8, lines: ['Jog, skip, and shuffle across the gym.'] },
      activity: { minutes: 20, lines: ['Jump and stick the landing, ten times.'] },
      game: { minutes: 12, lines: ['Freeze tag: freeze in a soft landing.'] },
      check: { minutes: 5, lines: ['Each student shows one landing.'] },
    },
  });
  it('an open band passes; under-13 bands wait for counsel', () => {
    expect(pePlanErrors(plan('10-12'))).toEqual([]);
    for (const b of GRADE_BANDS.filter((x) => x.held)) expect(pePlanErrors(plan(b.id)).some((e) => /wait for counsel/.test(e))).toBe(true);
  });
});

// ── the role: both ways into the coach store and authoring ──────────────────────────────────────────────────────────

const roleWith = (rows: string[], camp: string[], env: Record<string, string> = {}): RoleDeps => ({
  teacherRow: async (u) => rows.includes(u), campCertified: async (u) => camp.includes(u), env: env as NodeJS.ProcessEnv,
});

describe('the teacher role (EDU-01)', () => {
  it('the owner-granted role, or Camp-certified; nobody else', async () => {
    const r = roleWith(['t1'], ['f1']);
    expect(await teacherSource('t1', r)).toBe('owner');
    expect(await teacherSource('f1', r)).toBe('camp');
    expect(await teacherSource('applicant', r)).toBeNull();
    expect(await isTeacher(null, r)).toBe(false);
  });
  it('the coach store: through the teacher role, and through COACH_STORE_COACH_USER_IDS (the fallback)', async () => {
    const r = roleWith(['t1'], [], { COACH_STORE_COACH_USER_IDS: 'owner-1, owner-2' });
    expect(await isStoreCoachWith('t1', r)).toBe(true);        // the role
    expect(await isStoreCoachWith('owner-2', r)).toBe(true);   // the env list
    expect(await isStoreCoachWith('nobody', r)).toBe(false);
    // the env list alone, before the teacher SQL (the row read fails): the owner's store still works
    const before: RoleDeps = { teacherRow: async () => { throw new Error('relation does not exist'); }, campCertified: async () => false, env: { COACH_STORE_COACH_USER_IDS: 'owner-1' } as never };
    expect(await isStoreCoachWith('owner-1', before)).toBe(true);
    expect(await isStoreCoachWith('t1', before)).toBe(false);
  });
  it('authoring: a teacher or the env list; an env-listed account is not shown as a Teacher', async () => {
    const r = roleWith([], [], { COACH_STORE_COACH_USER_IDS: 'owner-1' });
    expect(await canAuthor('owner-1', r)).toBe(true);
    expect(await teacherSource('owner-1', r)).toBeNull();   // the badge reads the role only
  });
});

// ── the routes' logic, end to end on the in-memory tables ──────────────────────────────────────────────────────────

describe('apply → queue → approve → author → publish → read (EDU-01, EDU-02)', () => {
  let db: ReturnType<typeof teachDb>;
  let d: TeachApiDeps;
  const application = { discipline: 'jump', bio: 'I coach high-school jumpers and have for eight years, mostly on landing mechanics.', sample: 'Today we land before we jump. Stand tall, drop softly, and freeze the landing for three seconds.', links: [] };
  beforeEach(() => {
    resetTeachProbe();
    db = teachDb(true);
    d = { db, isAdult: async (u) => u !== 'teen', role: { teacherRow: async (u) => db.mem.roles.has(u), campCertified: async () => false, env: {} as never } };
  });

  it('opens soon before the SQL: apply answers 503 and nothing 500s', async () => {
    resetTeachProbe();
    const empty = teachDb(false);
    const dd: TeachApiDeps = { ...d, db: empty };
    expect((await apply('a1', application, dd)).status).toBe(503);
    expect((await me('a1', dd)).body).toMatchObject({ ready: false, teacher: null, application: null });
    expect((await queue(dd)).body).toMatchObject({ ready: false, applications: [] });
  });

  it('the whole path: an applicant is not a teacher until the owner approves; then authors and publishes', async () => {
    expect((await apply('teen', application, d)).status).toBe(403);
    expect((await apply('a1', { ...application, sample: 'This cures tendinitis, guaranteed.' }, d)).status).toBe(422);
    expect((await apply('a1', application, d)).status).toBe(201);
    expect((await apply('a1', application, d)).body).toMatchObject({ error: 'already_pending' });
    // an applicant: no role, no authoring, no badge
    expect((await me('a1', d)).body).toMatchObject({ teacher: null, canAuthor: false });
    expect((await listCourses('a1', d)).status).toBe(403);
    expect((await newCourse('a1', { title: 'x' }, d)).status).toBe(403);
    // the owner's queue
    const q = (await queue(d)).body.applications as { id: string }[];
    expect(q).toHaveLength(1);
    expect((await decide('owner', { id: q[0].id, decision: 'approved' }, d)).status).toBe(200);
    expect((await decide('owner', { id: q[0].id, decision: 'approved' }, d)).status).toBe(404);   // decided once
    expect((await me('a1', d)).body).toMatchObject({ teacher: 'owner', canAuthor: true });
    // author
    const created = await newCourse('a1', { title: 'First steps in jumping' }, d);
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const c = { ...goodCourse(), id, teacherId: 'a1' };
    // a draft is hidden from students; a publish with a claim is refused with the problem and not saved
    expect((await putCourse('a1', id, { ...c, status: 'draft' }, d)).status).toBe(200);
    expect(await readCourse('student', id, d)).toBeNull();
    expect(await readCourse('a1', id, d)).not.toBeNull();
    const bad = structuredClone(c);
    (bad.lessons[0].blocks[0] as { text: string }).text = 'Guaranteed to fix your knee.';
    const refused = await putCourse('a1', id, bad, d);
    expect(refused.status).toBe(422);
    expect((refused.body.problems as string[]).length).toBeGreaterThan(0);
    expect((await putCourse('a1', id, c, d)).status).toBe(200);
    expect((await readCourse('student', id, d))?.lessons).toHaveLength(3);
    // someone else cannot save it
    expect((await putCourse('t2', id, c, d)).status).toBe(403);
  });

  it('a non-teacher gets 403 on every authoring call', async () => {
    expect((await listCourses('nobody', d)).status).toBe(403);
    expect((await newCourse('nobody', {}, d)).status).toBe(403);
    expect((await putCourse('nobody', 'c1', goodCourse(), d)).status).toBe(403);
    expect((await checkPePlan('nobody', {}, d)).status).toBe(403);
  });
});
