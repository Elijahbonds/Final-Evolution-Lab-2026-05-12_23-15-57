'use client';
// CourseStudio — PLAT-P10 (EDU-02, 2026-11-03): a teacher builds a course on their phone. One column: the course's title,
// the lessons as numbered chips (and "+"), the open lesson's title and blocks, and "Add a block" → pick its kind. On a
// phone, Edit / Preview toggles to the lesson as a student sees it (CourseLesson); on a wider screen the preview sits on
// the right. Save draft keeps it; Publish runs the validator (lib/teach/course.ts courseErrors, the same one the route
// runs) and says what to fix. Audio and video wait for media storage (shown, not offered). Courses are free.
import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { SegmentedTabs } from '@/components/ui/fel/segmented-tabs';
import {
  CAMERA_CHOICES, DEMO_CHOICES, HELD_BLOCK_KINDS, LIVE_BLOCK_KINDS, PRACTICE_MODES, cameraLabel, courseErrors, newBlock,
  type Block, type Course, type CourseLesson as Lesson,
} from '@/lib/teach/course';
import { CourseLesson } from './course-lesson';
import { BLOCK_LABEL, TEACH_COPY as T } from './copy';
import { TEACH_LOOK as L } from './look';

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const emptyLesson = (): Lesson => ({ id: uid('l'), title: '', blocks: [] });

export function CourseStudio({ initial, teacherId }: { initial: Course | null; teacherId: string }) {
  const [course, setCourse] = useState<Course | null>(initial);
  const [at, setAt] = useState(0);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [picking, setPicking] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);

  const start = async () => {
    if (busy.current) return; busy.current = true;
    try {
      const r = await fetch('/api/teach/courses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '' }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.id) setCourse({ id: j.id, teacherId, title: '', summary: '', lessons: [emptyLesson()], status: 'draft' });
      else setNote(j.error === 'opens_soon' ? T.opensSoon : 'That did not start. Try again.');
    } finally { busy.current = false; }
  };

  const edit = (f: (c: Course) => Course) => setCourse((c) => (c ? f(c) : c));
  const editLesson = (f: (l: Lesson) => Lesson) => edit((c) => ({ ...c, lessons: c.lessons.map((l, k) => (k === at ? f(l) : l)) }));
  const editBlock = (id: string, patch: Partial<Block>) => editLesson((l) => ({ ...l, blocks: l.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)) }));

  const save = async (status: Course['status']) => {
    if (!course) return;
    const next = { ...course, status };
    if (status === 'published') {
      const errs = courseErrors(next);
      setProblems(errs);
      if (errs.length) return;
    }
    const r = await fetch(`/api/teach/courses/${encodeURIComponent(course.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setCourse(next); setProblems([]); setNote(status === 'published' ? T.published : 'Saved.'); }
    else { setProblems(Array.isArray(j.problems) ? j.problems : []); setNote(j.error === 'opens_soon' ? T.opensSoon : null); }
  };

  const lesson = course?.lessons[at] ?? null;
  const preview = useMemo(() => (lesson ? <CourseLesson lesson={lesson} preview /> : null), [lesson]);

  if (!course) {
    return (
      <div className="space-y-3" data-teach-studio="empty">
        <PrimaryCta onClick={() => void start()} testId="teach-start">{T.newCourse}</PrimaryCta>
        {note && <p className={L.error} role="status">{note}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-teach-studio={course.id}>
      <div className="md:hidden"><SegmentedTabs label="Edit or preview" items={[{ id: 'edit', label: T.edit }, { id: 'preview', label: T.preview }]} value={view} onChange={(v) => setView(v as 'edit' | 'preview')} idBase="teach-view" /></div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className={`space-y-4 ${view === 'preview' ? 'hidden md:block' : ''}`} data-teach-editor>
          <input value={course.title} onChange={(e) => edit((c) => ({ ...c, title: e.target.value }))} placeholder="Course title" aria-label="Course title" className={L.input} data-teach-title />
          <input value={course.summary} onChange={(e) => edit((c) => ({ ...c, summary: e.target.value }))} placeholder="One line: what it teaches" aria-label="Course summary" className={L.input} data-teach-summary />
          <nav className={L.chips} aria-label="Lessons">
            {course.lessons.map((l, k) => (
              <button key={l.id} type="button" aria-current={k === at ? 'true' : undefined} onClick={() => { setAt(k); setPicking(false); }} data-teach-lesson-tab={k}
                className={`${L.chip} ${k === at ? L.chipOn : ''}`}>{k + 1}</button>
            ))}
            <button type="button" className={L.chip} aria-label={T.addLesson} data-teach-add-lesson
              onClick={() => { edit((c) => ({ ...c, lessons: [...c.lessons, emptyLesson()] })); setAt(course.lessons.length); setPicking(false); }}><Plus className="h-4 w-4" /></button>
          </nav>
          {lesson && (
            <div className="space-y-3">
              <input value={lesson.title} onChange={(e) => editLesson((l) => ({ ...l, title: e.target.value }))} placeholder={`Lesson ${at + 1} title`} aria-label="Lesson title" className={L.input} data-teach-lesson-title />
              {lesson.blocks.map((b, k) => (
                <div key={b.id} className={L.card} data-teach-block={b.kind}>
                  <div className="flex items-center justify-between">
                    <span className={L.label}>{k + 1}. {BLOCK_LABEL[b.kind]}</span>
                    <button type="button" aria-label={`Remove block ${k + 1}`} className="fel-press grid h-11 w-11 place-items-center text-white/60"
                      onClick={() => editLesson((l) => ({ ...l, blocks: l.blocks.filter((x) => x.id !== b.id) }))}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <BlockFields b={b} set={(p) => editBlock(b.id, p)} />
                </div>
              ))}
              {picking ? (
                <div className={L.chips} data-teach-kinds>
                  {LIVE_BLOCK_KINDS.map((k) => (
                    <button key={k} type="button" className={L.chip} data-teach-kind={k}
                      onClick={() => { editLesson((l) => ({ ...l, blocks: [...l.blocks, newBlock(k, uid('b'))] })); setPicking(false); }}>{BLOCK_LABEL[k]}</button>
                  ))}
                  {HELD_BLOCK_KINDS.map((k) => <button key={k} type="button" disabled className={L.chip} title="Opens with media storage">{BLOCK_LABEL[k]} · soon</button>)}
                </div>
              ) : (
                <button type="button" className={L.chip} onClick={() => setPicking(true)} data-teach-add-block><Plus className="h-4 w-4" />{T.addBlock}</button>
              )}
            </div>
          )}
          {problems.length > 0 && <ul className="space-y-1" role="alert" data-teach-problems>{problems.slice(0, 8).map((p) => <li key={p} className={L.error}>{p}</li>)}</ul>}
          {note && <p className={L.ok} role="status" data-teach-note>{note}</p>}
          <div className="flex items-center gap-3">
            <button type="button" className={L.chip} onClick={() => void save('draft')} data-teach-save>{T.save}</button>
            <span className={L.label}>{T.free}</span>
          </div>
          <PrimaryCta onClick={() => void save('published')} testId="teach-publish">{T.publish}</PrimaryCta>
        </section>
        <section className={view === 'edit' ? 'hidden md:block' : ''} aria-label={T.preview} data-teach-preview>{preview}</section>
      </div>
    </div>
  );
}

function BlockFields({ b, set }: { b: Block; set: (p: Partial<Block>) => void }) {
  switch (b.kind) {
    case 'card':
      return (
        <>
          <input value={b.title} onChange={(e) => set({ title: e.target.value })} placeholder="Card title" aria-label="Card title" className={L.input} data-field="title" />
          <textarea value={b.text} onChange={(e) => set({ text: e.target.value })} placeholder="What to know, in a few short lines" aria-label="Card text" className={L.area} data-field="text" />
        </>
      );
    case 'demo':
      return (
        <select value={b.clip} onChange={(e) => set({ clip: e.target.value })} aria-label="Demo" className={L.input} data-field="clip">
          {DEMO_CHOICES.map((c) => <option key={c.clip} value={c.clip}>{c.label}</option>)}
        </select>
      );
    case 'camera':
      return (
        <select value={b.movement} onChange={(e) => set({ movement: e.target.value as typeof b.movement })} aria-label="Camera check" className={L.input} data-field="movement">
          {CAMERA_CHOICES.map((m) => <option key={m} value={m}>{cameraLabel(m)}</option>)}
        </select>
      );
    case 'quiz':
      return (
        <>
          <input value={b.question} onChange={(e) => set({ question: e.target.value })} placeholder="Question" aria-label="Question" className={L.input} data-field="question" />
          {b.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name={`ans-${b.id}`} checked={b.answer === i} onChange={() => set({ answer: i })} aria-label={`Option ${i + 1} is right`} className="h-6 w-6 accent-fel-cyan" data-field={`answer-${i}`} />
              <input value={o} onChange={(e) => set({ options: b.options.map((x, k) => (k === i ? e.target.value : x)) })} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} className={L.input} data-field={`option-${i}`} />
            </div>
          ))}
          {b.options.length < 4 && <button type="button" className={L.chip} onClick={() => set({ options: [...b.options, ''] })}>Add an option</button>}
          <input value={b.why} onChange={(e) => set({ why: e.target.value })} placeholder="Why that answer" aria-label="Why" className={L.input} data-field="why" />
        </>
      );
    case 'practice':
      return (
        <>
          <select value={b.mode} onChange={(e) => set({ mode: e.target.value })} aria-label="Game" className={L.input} data-field="mode">
            {PRACTICE_MODES.map((m) => <option key={m.mode} value={m.mode}>{m.label}</option>)}
          </select>
          <input value={b.goal} onChange={(e) => set({ goal: e.target.value })} placeholder="What to practice there" aria-label="Goal" className={L.input} data-field="goal" />
        </>
      );
    default:
      return null;
  }
}
