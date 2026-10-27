'use client';

// The lesson player. One lesson at a time, because a chapter dumped on a page is a book, not a course.
//
// PLAT-P04 (2026-10-27): lessons that SHOW before they tell. The owner: the app "still feels cheap" (too much text, no
// motion); the standing rule is autoplay, no extra taps, never confusing. So a lesson now reads, top to bottom:
//   1. the demo — the avatar doing the movement, playing by itself on open, where the library has a loop that IS this
//      movement (lib/education/lessonDemo.ts; no loop, no demo: never a borrowed movement);
//   2. the steps as short cards you swipe (lesson-steps.ts: the book's own steps, split only between their sentences);
//      a lesson with no steps leads with one line instead — the book's own first sentence, verbatim;
//   3. "Check it on camera" / "Run it on camera";
//   4. the book itself behind "Read more", collapsed, in its own words — never reworded (the owner's book);
// and, once every lesson is done, the chapter's recap and its check. Somebody standing in their front room with a phone
// propped up needs to see it and do it; the reasoning is what they read afterwards, or never.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import type { Chapter, Lesson } from '@/lib/education/course';
import { chapterProgress, lessonId, nextChapterHref } from '@/lib/education/course';
// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5: "Next chapter" opens the next chapter, a lesson that teaches a
// Mirror movement links to the camera, and the chapter check (owner decision 6: shards at 80%) sits under the recap.
import { movementForLesson } from '@/lib/education/lessonMovement';
import { demoForLesson } from '@/lib/education/lessonDemo';
import { AvatarDemo } from '@/components/library/avatar-demo';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { StatRing } from '@/components/ui/fel/stat-ring';
import { Chip } from '@/components/ui/fel/chip';
import { TYPE } from '@/lib/design/type';
import { CameraLink } from './camera-link';
import { DrillsLink } from '@/components/drills/drills-link';
import { ChapterCheck } from './chapter-check';
import { StepCards } from './step-cards';
import { stepCards, summaryLine } from './lesson-steps';
import { deviceStore, writeLastLesson } from './last-lesson';
import { CHIP_BUTTON } from './look';

const threeDisabled = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';

export function ChapterReader({ chapter, filmFor, startAt }: { chapter: Chapter; filmFor?: Record<string, string>; startAt?: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const start = startAt ? chapter.lessons.findIndex((l) => l.key === startAt) : -1;
  const [i, setI] = useState(Math.max(0, start));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/education/playbook')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !Array.isArray(j?.done)) return;
        const set = new Set<string>(j.done);
        setDone(set);
        // Learn's Continue names the lesson (?lesson=); otherwise open on the first thing they have not done, rather than
        // making them page past their own progress.
        if (start >= 0) return;
        const next = chapter.lessons.findIndex((l) => !set.has(lessonId(chapter.number, l.key)));
        if (next > 0) setI(next);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [chapter, start]);

  const lesson = chapter.lessons[i];
  const id = lesson ? lessonId(chapter.number, lesson.key) : '';

  // Where you are, on this device only, so Learn's Continue brings you straight back (components/education/last-lesson.ts).
  useEffect(() => {
    if (lesson) writeLastLesson(deviceStore(), { chapter: chapter.number, lesson: lesson.key, at: Date.now() });
  }, [chapter.number, lesson]);

  const isDone = done.has(id);
  const progress = useMemo(() => chapterProgress(chapter, done), [chapter, done]);
  const film = lesson ? filmFor?.[lesson.key] : undefined;
  const movement = id ? movementForLesson(id) : null;
  const clip = id ? demoForLesson(id) : null;
  const next = nextChapterHref(chapter.number);
  const chapterDone = progress.total > 0 && progress.done === progress.total;
  const last = i === chapter.lessons.length - 1;

  const complete = useCallback(async () => {
    if (!lesson || busy || isDone) { setI((n) => Math.min(chapter.lessons.length - 1, n + 1)); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/education/playbook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chapter: chapter.number, lesson: lesson.key }),
      });
      const j = await res.json().catch(() => ({}));
      if (Array.isArray(j?.done)) setDone(new Set(j.done));
      if (j?.awarded > 0) toast.success(`Chapter done — ${j.awarded + (j.bonus > 0 ? j.bonus : 0)} shards.`);
      else if (j?.chapterComplete && j?.payPath === 'check') toast.success('Chapter read. The chapter check is below.');
      else if (j?.chapterComplete) toast.success('Chapter done.');
      setI((n) => Math.min(chapter.lessons.length - 1, n + 1));
    } catch {
      // EDU-LINKS (2026-10-07): this promised the place was saved on the device, and nothing saved it — the lesson was
      // not kept anywhere, so a reload lost it. Say what happened instead.
      toast.error('Could not save that lesson. Check your connection and tap it again.');
    } finally {
      setBusy(false);
    }
  }, [lesson, busy, isDone, chapter]);

  if (!lesson) return <p className={`${TYPE.body} text-fel-dim`}>This chapter has no lessons yet.</p>;

  const cards = lesson.kind === 'drill' ? stepCards(lesson.steps) : [];
  const summary = cards.length ? null : summaryLine(lesson);
  const nextLabel = next === '/education/playbook' ? 'All chapters' : 'Next chapter';

  return (
    <div className="pb-24 md:pb-0">
      <div className="mb-4 flex items-center gap-3" data-lesson-progress>
        <StatRing value={progress.pct} max={100} label="Chapter progress" display="" size={36} stroke={4} />
        <p className={`${TYPE.label} flex-1 text-fel-dim`}>Lesson {i + 1} of {chapter.lessons.length}</p>
        {i > 0 && (
          <button type="button" onClick={() => setI((n) => Math.max(0, n - 1))} className={CHIP_BUTTON} aria-label="Previous lesson">
            <ArrowLeft aria-hidden className="h-4 w-4" /> Back
          </button>
        )}
      </div>

      {/* The lesson, keyed so each one animates in rather than swapping silently. */}
      <article key={lesson.key} className="fel-rise" data-lesson={id} data-lesson-kind={lesson.kind}>
        {/* 1. Show: the demo plays by itself on open. A filmed drill plays its film the same way. */}
        {film ? (
          <video src={film} autoPlay muted loop playsInline preload="metadata" data-lesson-film
            className="aspect-video w-full rounded-[20px] border border-[color:var(--fel-hairline)] bg-black" />
        ) : clip && !threeDisabled ? (
          <div data-lesson-demo={clip} className="overflow-hidden rounded-[20px] border border-[color:var(--fel-hairline)]">
            <AvatarDemo clip={clip} />
          </div>
        ) : null}

        <div className={`flex flex-wrap items-center gap-2 ${film || clip ? 'mt-4' : ''}`}>
          <Chip tone={lesson.kind === 'drill' ? 'accent' : 'neutral'}>{lesson.kind === 'drill' ? 'Do this' : 'Understand this'}</Chip>
          {isDone && <Chip tone="success" icon={<Check aria-hidden className="h-3 w-3" strokeWidth={3} />}>Done</Chip>}
        </div>
        <h2 className={`${TYPE.heading} mt-3 text-white`}>{lesson.title}</h2>

        {/* 2. Then the steps, a card at a time — or the book's one line where there are no steps. */}
        {cards.length > 0 && <StepCards cards={cards} />}
        {summary && (
          <p data-lesson-summary className={`fel-surface mt-4 p-5 ${TYPE.heading} normal-case tracking-normal text-white`}>{summary}</p>
        )}

        {/* 3. Learn it, then check it on camera (lib/education/lessonMovement.ts). */}
        {movement && <div className="mt-5"><CameraLink movement={movement} /></div>}
        {/* …and run its drill on camera (lib/drills/playbookLinks.ts; Mirror & coaching Phase 6) */}
        {id && <DrillsLink lessonId={id} />}

        {/* 4. The book, behind Read more: the owner's words, verbatim. */}
        <BookText lesson={lesson} />
      </article>

      {/* The screen's one primary, where a thumb is: done, next, or on to the next chapter. */}
      {chapterDone && last ? (
        <PrimaryCta href={next} docked testId="lesson-primary">{nextLabel}</PrimaryCta>
      ) : (
        <PrimaryCta onClick={complete} docked testId="lesson-primary">
          {isDone ? 'Next' : last ? 'Finish the chapter' : 'Mark done'}
        </PrimaryCta>
      )}

      {chapterDone && (
        <section data-chapter-done className="fel-surface mt-8 p-5">
          {chapter.remember.length > 0 && (
            <>
              <h3 className={`${TYPE.heading} text-white`}>What to remember</h3>
              <ul className="mt-3 space-y-2">
                {chapter.remember.map((r, n) => (
                  <li key={n} className={`flex gap-2.5 ${TYPE.small} text-fel-soft`}>
                    <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-fel-emerald" />
                    {r}
                  </li>
                ))}
              </ul>
            </>
          )}
          {/* EDU-LINKS (2026-10-07): this went to the course index from every chapter. It opens the next one now, and the
              index after the last; and it shows on a chapter with no recap (5 and 8 have none), which it never did. */}
          <div className="mt-4"><Chip href={next} testId="next-chapter">{nextLabel}</Chip></div>
        </section>
      )}

      {chapterDone && <ChapterCheck chapter={chapter.number} />}
    </div>
  );
}

/** The book's text for a lesson — its purpose, its paragraphs, its trainer's note — exactly as imported, behind Read more. */
export function BookText({ lesson }: { lesson: Lesson }) {
  const conceptSteps = lesson.kind !== 'drill' ? lesson.steps : [];
  if (!lesson.purpose && !lesson.prose.length && !conceptSteps.length && !lesson.note) return null;
  return (
    <details data-read-more className="group mt-5">
      <summary className={`${TYPE.label} flex min-h-11 cursor-pointer list-none items-center gap-2 text-fel-cyan [&::-webkit-details-marker]:hidden`}>
        <span className="group-open:hidden">Read more</span>
        <span className="hidden group-open:inline">Read less</span>
      </summary>
      <div data-book-text className="mt-2 space-y-4">
        {lesson.purpose && <p data-book-purpose className={`${TYPE.body} text-fel-soft`}>{lesson.purpose}</p>}
        {lesson.prose.map((p, n) => <p key={n} data-book-para className={`${TYPE.body} text-fel-soft`}>{p}</p>)}
        {conceptSteps.length > 0 && (
          <ul className="space-y-2">
            {conceptSteps.map((s, n) => <li key={n} data-book-step className={`${TYPE.body} text-fel-soft`}>{s}</li>)}
          </ul>
        )}
        {/* The book sets these as callouts and so does the course — it is the author talking to the coach. */}
        {lesson.note && (
          <aside className="rounded-[16px] border border-fel-gold/25 bg-fel-gold/[0.05] p-4">
            <p className={`${TYPE.label} flex items-center gap-2 text-fel-gold`}><Lightbulb aria-hidden className="h-3.5 w-3.5" /> Trainer&rsquo;s note</p>
            <p data-book-note className={`${TYPE.body} mt-2 text-fel-soft`}>{lesson.note}</p>
          </aside>
        )}
      </div>
    </details>
  );
}
