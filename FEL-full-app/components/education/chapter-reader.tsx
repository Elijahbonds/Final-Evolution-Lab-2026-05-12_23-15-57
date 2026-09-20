'use client';

// The lesson player. One lesson at a time, because a chapter dumped on a page is a book, not a course.
//
// A drill lesson leads with WHAT YOU DO — the numbered steps — and keeps the book's explanation underneath it.
// That ordering is deliberate: somebody standing in their front room with a phone propped up needs the steps,
// and the reasoning is what they read afterwards or never. A concept lesson has it the other way round.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Gem, Lightbulb, Play } from 'lucide-react';
import { toast } from 'sonner';
import type { Chapter } from '@/lib/education/course';
import { chapterProgress, lessonId } from '@/lib/education/course';

export function ChapterReader({ chapter, filmFor }: { chapter: Chapter; filmFor?: Record<string, string> }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/education/playbook')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !Array.isArray(j?.done)) return;
        const set = new Set<string>(j.done);
        setDone(set);
        // Open on the first thing they have not done, rather than making them scroll past their own progress.
        const next = chapter.lessons.findIndex((l) => !set.has(lessonId(chapter.number, l.key)));
        if (next > 0) setI(next);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [chapter]);

  const lesson = chapter.lessons[i];
  const id = lesson ? lessonId(chapter.number, lesson.key) : '';
  const isDone = done.has(id);
  const progress = useMemo(() => chapterProgress(chapter, done), [chapter, done]);
  const film = lesson ? filmFor?.[lesson.key] : undefined;

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
      if (j?.awarded > 0) toast.success(`Chapter done — ${j.awarded} shards.`);
      else if (j?.chapterComplete) toast.success('Chapter done.');
      setI((n) => Math.min(chapter.lessons.length - 1, n + 1));
    } catch {
      toast.error('Could not save that — your place is kept locally.');
    } finally {
      setBusy(false);
    }
  }, [lesson, busy, isDone, chapter]);

  if (!lesson) return <p className="text-white/45">This chapter has no lessons yet.</p>;

  return (
    <>
      <div className="mb-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            Lesson {i + 1} of {chapter.lessons.length}
          </p>
          <p className="font-mono text-[11px] text-white/35">{progress.pct}%</p>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full bg-[#00FF9D] transition-[width] duration-500" style={{ width: `${progress.pct}%` }} />
        </div>
      </div>

      {/* The lesson itself, keyed so each one animates in rather than swapping silently. */}
      <article key={lesson.key} className="fel-rise rounded-2xl border border-white/8 bg-white/[0.02] p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-md px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em]"
            style={{
              background: lesson.kind === 'drill' ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.06)',
              color: lesson.kind === 'drill' ? '#00E5FF' : 'rgba(255,255,255,0.45)',
            }}
          >
            {lesson.kind === 'drill' ? 'Do this' : 'Understand this'}
          </span>
          {isDone && (
            <span className="inline-flex items-center gap-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#00FF9D]">
              <Check className="h-3 w-3" strokeWidth={3} /> Done
            </span>
          )}
        </div>

        <h2 className="fel-heading mt-3 text-[22px] font-black leading-tight text-white sm:text-[26px]">{lesson.title}</h2>
        {lesson.purpose && <p className="mt-2 text-[14px] leading-relaxed text-white/60">{lesson.purpose}</p>}

        {/* The film, when one exists for this drill. Until then the steps carry it — see scripts/education/
            ingest-films.ts for how a filmed exercise gets attached. */}
        {film && (
          <video
            src={film}
            controls
            playsInline
            preload="metadata"
            className="mt-5 aspect-video w-full rounded-xl border border-white/10 bg-black"
          />
        )}

        {/* A drill leads with what you do. A concept leads with why. */}
        {lesson.kind === 'drill' && lesson.steps.length > 0 && (
          <ol className="mt-5 space-y-2.5">
            {lesson.steps.map((s, n) => (
              <li key={n} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#00E5FF]/12 font-mono text-[10px] font-black text-[#00E5FF]">
                  {n + 1}
                </span>
                <span className="text-[14px] leading-relaxed text-white/80">{s}</span>
              </li>
            ))}
          </ol>
        )}

        {lesson.prose.map((p, n) => (
          <p key={n} className="mt-4 text-[14.5px] leading-[1.75] text-white/65">{p}</p>
        ))}

        {lesson.kind !== 'drill' && lesson.steps.length > 0 && (
          <ul className="mt-4 space-y-2">
            {lesson.steps.map((s, n) => (
              <li key={n} className="flex gap-2.5 text-[14px] leading-relaxed text-white/70">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-white/30" />
                {s}
              </li>
            ))}
          </ul>
        )}

        {/* The book sets these as callouts and so does the course — it is the author talking to the coach. */}
        {lesson.note && (
          <aside className="mt-6 rounded-xl border border-[#FFD700]/25 bg-[#FFD700]/[0.05] p-4">
            <p className="flex items-center gap-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#FFD700]">
              <Lightbulb className="h-3.5 w-3.5" /> Trainer&rsquo;s note
            </p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-white/70">{lesson.note}</p>
          </aside>
        )}
      </article>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={i === 0}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-white/50
                     transition-colors hover:border-white/30 hover:text-white disabled:opacity-30"
          aria-label="Previous lesson"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={complete}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold
                     transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          style={{
            background: isDone ? 'rgba(255,255,255,0.06)' : '#00FF9D',
            color: isDone ? 'rgba(255,255,255,0.7)' : '#050505',
          }}
        >
          {isDone ? <>Next <ArrowRight className="h-4 w-4" /></>
            : i === chapter.lessons.length - 1 ? <>Finish the chapter <Gem className="h-4 w-4" /></>
            : <>Mark done <Check className="h-4 w-4" strokeWidth={3} /></>}
        </button>
      </div>

      {chapter.remember.length > 0 && progress.done === progress.total && (
        <section className="mt-8 rounded-2xl border border-[#00FF9D]/25 bg-[#00FF9D]/[0.04] p-5">
          <h3 className="fel-heading text-[15px] font-bold text-white">What to remember</h3>
          <ul className="mt-3 space-y-2">
            {chapter.remember.map((r, n) => (
              <li key={n} className="flex gap-2.5 text-[13.5px] leading-relaxed text-white/70">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#00FF9D]" />
                {r}
              </li>
            ))}
          </ul>
          <Link
            href="/education/playbook"
            className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#00FF9D]"
          >
            <Play className="h-3 w-3" /> Next chapter
          </Link>
        </section>
      )}
    </>
  );
}
