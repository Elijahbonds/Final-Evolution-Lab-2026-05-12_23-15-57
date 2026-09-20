'use client';

// The course index — ten chapters, what each one is for, and how far in you are.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Check, Gem } from 'lucide-react';
import { CHAPTERS, CHAPTER_SHARDS, chapterProgress, courseProgress } from '@/lib/education/course';

const AUDIENCE_LABEL: Record<string, string> = { athlete: 'Athlete', parent: 'Parent', coach: 'Coach' };

export function ChapterList() {
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    fetch('/api/education/playbook')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && Array.isArray(j?.done)) setDone(new Set(j.done)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const overall = courseProgress(done);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Your progress</p>
            <p className="font-mono text-[11px] text-white/45">{overall.done} / {overall.total} lessons</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${overall.pct}%`, background: 'linear-gradient(90deg,#00E5FF,#00FF9D)' }}
            />
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#A855F7]/30 bg-[#A855F7]/[0.07] px-2.5 py-1.5">
          <Gem className="h-3.5 w-3.5 text-[#A855F7]" />
          <span className="font-mono text-[11px] font-bold text-white">{CHAPTER_SHARDS}</span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/40">a chapter</span>
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {CHAPTERS.map((c, i) => {
          const p = chapterProgress(c, done);
          const complete = p.total > 0 && p.done === p.total;
          return (
            <li key={c.number} className="fel-rise" style={{ ['--fel-rise-delay' as string]: `${i * 35}ms` }}>
              <Link
                href={`/education/playbook/${c.number}`}
                className="group flex h-full flex-col rounded-2xl border p-5 transition-all duration-300
                           hover:-translate-y-0.5 hover:border-white/20"
                style={{
                  borderColor: complete ? 'rgba(0,255,157,0.30)' : 'rgba(255,255,255,0.08)',
                  background: complete ? 'rgba(0,255,157,0.04)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-mono text-[12px] font-black"
                    style={{
                      background: complete ? 'rgba(0,255,157,0.15)' : 'rgba(255,255,255,0.05)',
                      color: complete ? '#00FF9D' : 'rgba(255,255,255,0.45)',
                    }}
                  >
                    {complete ? <Check className="h-4 w-4" strokeWidth={3} /> : c.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="fel-heading text-[16px] font-bold leading-tight text-white">{c.title}</h3>
                    <p className="mt-1 text-[12.5px] leading-snug text-white/40">{c.subtitle}</p>
                  </div>
                </div>

                {/* The chapter's own opening line does the work of a blurb, and it is the author's sentence. */}
                <p className="mt-3 line-clamp-2 text-[13px] italic leading-relaxed text-white/55">{c.thesis}</p>

                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                  {c.audience.map((a) => (
                    <span
                      key={a}
                      className="rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40"
                    >
                      {AUDIENCE_LABEL[a] ?? a}
                    </span>
                  ))}
                  <span className="ml-auto font-mono text-[10px] text-white/30">{p.done}/{p.total}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 flex items-center gap-2 text-[12px] text-white/30">
        <BookOpen className="h-3.5 w-3.5" />
        From The Neuro-Mechanic Playbook by Elijah Bonds.
      </p>
    </>
  );
}
