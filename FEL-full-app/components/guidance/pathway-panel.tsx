'use client';

// The counsellor, on screen at last.
//
// lib/guidance/pathways.ts has been complete since 2026-09-12 with zero consumers — nineteen pathways and a
// scorer that shows its working, and nothing calling it. This is the surface.
//
// Its rules are the module's own and they are the point: it never closes a door, it shows what it read, and it
// suggests ONE next step rather than a career plan. A low-evidence account gets invitations, never a verdict.

import { useEffect, useState } from 'react';
import { Compass, ArrowUpRight, Sparkles } from 'lucide-react';
import { DISCIPLINE_META } from '@/lib/creator/creative-card-types';

interface Suggestion {
  id: string; title: string; discipline: string; looksLike: string; firstStep: string;
  strength: number; exploratory: boolean; because: string[];
}
interface Payload { note: string; suggestions: Suggestion[]; adjacent: Omit<Suggestion, 'strength' | 'exploratory' | 'because'>[] }

function accentFor(d: string): string {
  return (DISCIPLINE_META as Record<string, { color?: string }>)[d]?.color ?? '#00E5FF';
}

export function PathwayPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/guidance')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no'))))
      .then((j) => { if (live) setData(j); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) return null;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-white/[0.03]" />;

  return (
    <>
      <p className="mb-5 text-[14px] leading-relaxed text-white/60">{data.note}</p>

      <ul className="grid gap-3 lg:grid-cols-2">
        {data.suggestions.map((s, i) => {
          const accent = accentFor(s.discipline);
          return (
            <li key={s.id} className="fel-rise" style={{ ['--fel-rise-delay' as string]: `${i * 45}ms` }}>
              <article
                className="flex h-full flex-col rounded-2xl border p-5"
                style={{ borderColor: `${accent}30`, background: `${accent}08` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
                      {s.discipline}
                    </p>
                    <h3 className="fel-heading mt-1 text-[18px] font-bold leading-tight text-white">{s.title}</h3>
                  </div>
                  {s.exploratory && (
                    <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                      Worth a try
                    </span>
                  )}
                </div>

                <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/60">{s.looksLike}</p>

                <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                  <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/35">
                    One next step
                  </p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/80">{s.firstStep}</p>
                </div>

                {/* What it read. Somebody can disagree with a fact; nobody can argue with a black box. */}
                {s.because.length > 0 && (
                  <ul className="mt-auto space-y-1 pt-4">
                    {s.because.map((b, n) => (
                      <li key={n} className="flex gap-2 font-mono text-[10.5px] leading-relaxed text-white/30">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: accent }} />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </li>
          );
        })}
      </ul>

      {data.adjacent.length > 0 && (
        <section className="mt-8">
          <h2 className="fel-heading flex items-center gap-2 text-[15px] font-bold text-white/80">
            <Compass className="h-4 w-4 text-white/40" /> Next door to these
          </h2>
          <p className="mt-1 text-[12.5px] text-white/40">
            Interests move. These sit beside what you are already doing.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.adjacent.map((p) => (
              <li key={p.id} className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
                <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-white/85">
                  <ArrowUpRight className="h-3.5 w-3.5" style={{ color: accentFor(p.discipline) }} />
                  {p.title}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-white/40">{p.looksLike}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 flex items-start gap-2 text-[12px] leading-relaxed text-white/30">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This reads what you actually do, not a quiz you filled in. It is a suggestion, never a verdict — every
        one of these stays open to you whatever it says.
      </p>
    </>
  );
}
