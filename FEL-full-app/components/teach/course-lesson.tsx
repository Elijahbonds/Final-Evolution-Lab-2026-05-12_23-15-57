'use client';
// CourseLesson — PLAT-P10 (EDU-02, 2026-11-03): one lesson of a course, block by block, as a student sees it (and as the
// teacher's preview shows it). Shows before it tells: a demo block plays by itself (AvatarDemo, the library's loop,
// read-only); a camera check is the lesson player's own CameraLink; a book block is the owner's book through phase 4's
// lesson pieces (StepCards and BookText: the book's words, never copied); a quiz answers on the device; a practice block
// opens the game mode and shows the student's own best there (never ranked, staked or paid).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, Gamepad2 } from 'lucide-react';
import { CHIP_BUTTON } from '@/components/education/look';
import { AvatarDemo } from '@/components/library/avatar-demo';
import { cameraHref, MOVEMENT_LABEL } from '@/lib/education/lessonMovement';
import { BookText } from '@/components/education/chapter-reader';
import { StepCards } from '@/components/education/step-cards';
import { stepCards } from '@/components/education/lesson-steps';
import type { Block, CourseLesson as Lesson, QuizBlock, PracticeBlock } from '@/lib/teach/course';
import { practiceHref, practiceLabel } from '@/lib/teach/course';
import { bookLesson } from '@/lib/teach/playbookCourse';
import { TEACH_LOOK as L } from './look';

/**
 * PLAT-P10: shows before it tells, as phase 4's lesson player does — the lesson's demos lead, playing by themselves, and
 * every other block follows in one row of cards you swipe, or step through with "Next step" (the row scrolls inside
 * itself, so the page never scrolls sideways). One block's words at a time on the first screen.
 */
export function CourseLesson({ lesson, preview = false }: { lesson: Lesson; preview?: boolean }) {
  const demos = lesson.blocks.filter((b) => b.kind === 'demo');
  const rest = lesson.blocks.filter((b) => b.kind !== 'demo');
  return (
    <div className="space-y-4" data-course-lesson={lesson.id}>
      {demos.map((b) => <BlockView key={b.id} b={b} preview={preview} />)}
      {rest.length > 0 && <BlockRow blocks={rest} preview={preview} />}
    </div>
  );
}

function BlockRow({ blocks, preview }: { blocks: Block[]; preview: boolean }) {
  const row = useRef<HTMLOListElement>(null);
  const [at, setAt] = useState(0);
  const onScroll = useCallback(() => {
    const el = row.current;
    if (!el) return;
    let best = 0, dist = Infinity;
    [...el.children].forEach((k, n) => { const d = Math.abs((k as HTMLElement).offsetLeft - el.offsetLeft - el.scrollLeft); if (d < dist) { dist = d; best = n; } });
    setAt(best);
  }, []);
  const next = useCallback(() => {
    const el = row.current;
    const k = el?.children[Math.min(blocks.length - 1, at + 1)] as HTMLElement | undefined;
    if (!el || !k) return;
    el.scrollTo({ left: k.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    setAt((n) => Math.min(blocks.length - 1, n + 1));
  }, [at, blocks.length]);
  return (
    <div data-block-row>
      <ol ref={row} onScroll={onScroll} aria-label="Lesson steps"
        className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {blocks.map((b, n) => <li key={b.id} data-block-step={n} className="w-full shrink-0 basis-full snap-start"><BlockView b={b} preview={preview} /></li>)}
      </ol>
      {blocks.length > 1 && (
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
          <span aria-hidden className="flex gap-1.5">
            {blocks.map((_, n) => <span key={n} className={`h-1.5 rounded-full transition-all duration-300 ${n === at ? 'w-5 bg-fel-cyan' : 'w-1.5 bg-white/20'}`} />)}
          </span>
          {at < blocks.length - 1 && <button type="button" onClick={next} data-block-next className={CHIP_BUTTON}>Next step <ArrowRight aria-hidden className="h-4 w-4" /></button>}
        </div>
      )}
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
      // the lesson player's camera link (lessonMovement cameraHref: the Mirror, on its pattern), on the type scale
      return (
        <a href={cameraHref(b.movement)} data-block="camera" data-camera-link={b.movement} className={L.row}>
          <span className="flex items-center gap-2"><Camera aria-hidden className="h-4 w-4 text-fel-cyan" />Check it on camera: {MOVEMENT_LABEL[b.movement]}</span>
          <ArrowRight aria-hidden className="h-4 w-4" />
        </a>
      );
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
