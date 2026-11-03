'use client';
// CourseLesson — PLAT-P10 (EDU-02, 2026-11-03): one lesson of a course, block by block, as a student sees it (and as the
// teacher's preview shows it). Shows before it tells: a demo block plays by itself (AvatarDemo, the library's loop,
// read-only); a camera check is the lesson player's own CameraLink; a book block is the owner's book through phase 4's
// lesson pieces (StepCards and BookText: the book's words, never copied); a quiz answers on the device; a practice block
// opens the game mode and shows the student's own best there (never ranked, staked or paid).
import { useEffect, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { AvatarDemo } from '@/components/library/avatar-demo';
import { CameraLink } from '@/components/education/camera-link';
import { BookText } from '@/components/education/chapter-reader';
import { StepCards } from '@/components/education/step-cards';
import { stepCards } from '@/components/education/lesson-steps';
import type { Block, CourseLesson as Lesson, QuizBlock, PracticeBlock } from '@/lib/teach/course';
import { practiceHref, practiceLabel } from '@/lib/teach/course';
import { bookLesson } from '@/lib/teach/playbookCourse';
import { TEACH_LOOK as L } from './look';

export function CourseLesson({ lesson, preview = false }: { lesson: Lesson; preview?: boolean }) {
  return (
    <div className="space-y-4" data-course-lesson={lesson.id}>
      {lesson.blocks.map((b) => <BlockView key={b.id} b={b} preview={preview} />)}
    </div>
  );
}

function BlockView({ b, preview }: { b: Block; preview: boolean }) {
  switch (b.kind) {
    case 'demo':
      return <div className="overflow-hidden rounded-2xl border border-white/10" data-block="demo"><AvatarDemo clip={b.clip || null} /></div>;
    case 'card':
      return (
        <section className={L.card} data-block="card">
          {b.title && <h3 className={L.title}>{b.title}</h3>}
          {b.text && <p className={L.text}>{b.text}</p>}
        </section>
      );
    case 'camera':
      return <div data-block="camera"><CameraLink movement={b.movement} /></div>;
    case 'quiz':
      return <Quiz b={b} />;
    case 'practice':
      return <Practice b={b} preview={preview} />;
    case 'book': {
      const found = bookLesson(b.lesson);
      if (!found) return null;
      const cards = found.lesson.kind === 'drill' ? stepCards(found.lesson.steps) : [];
      return <div data-block="book" data-book-ref={b.lesson}><StepCards cards={cards} /><BookText lesson={found.lesson} /></div>;
    }
    default:
      return null;
  }
}

function Quiz({ b }: { b: QuizBlock }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <section className={L.card} data-block="quiz">
      <p className={`${L.text} font-semibold text-white`}>{b.question}</p>
      <div className="grid gap-2">
        {b.options.map((o, i) => {
          const shown = pick !== null;
          const right = i === b.answer;
          return (
            <button key={i} type="button" disabled={shown} onClick={() => setPick(i)} data-quiz-option={i}
              className={`${L.row} ${shown && right ? 'border-[#00FF9D]/60' : shown && i === pick ? 'border-[#FF6B8A]/60' : ''}`}>
              <span>{o}</span>{shown && right && <span className={L.ok} aria-label="right answer">✓</span>}
            </button>
          );
        })}
      </div>
      {pick !== null && <p className={L.text} data-quiz-why>{pick === b.answer ? 'Right. ' : 'Not quite. '}{b.why}</p>}
    </section>
  );
}

function Practice({ b, preview }: { b: PracticeBlock; preview: boolean }) {
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    if (preview) return;
    let live = true;
    fetch(`/api/teach/practice?mode=${encodeURIComponent(b.mode)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && typeof j?.best === 'number') setBest(j.best); }).catch(() => {});
    return () => { live = false; };
  }, [b.mode, preview]);
  return (
    <section className={L.card} data-block="practice">
      {b.goal && <p className={L.text}>{b.goal}</p>}
      <a href={practiceHref(b.mode)} className={L.row} data-practice-mode={b.mode}>
        <span className="flex items-center gap-2"><Gamepad2 aria-hidden className="h-4 w-4 text-fel-cyan" />Practice in {practiceLabel(b.mode)}</span>
        {best !== null && <span className={L.label} data-practice-best>Your best {best}</span>}
      </a>
    </section>
  );
}
