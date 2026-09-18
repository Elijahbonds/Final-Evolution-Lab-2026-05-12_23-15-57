'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Lock, GraduationCap, Dumbbell, ChevronDown, Loader2, Zap, Brain } from 'lucide-react';
import { TRACKS, MODE_INFO } from '@/lib/game-data';

/** NEXUS adaptive queue item (from /api/nexus/queue) */
interface NexusQueueItem {
  id: string;
  title: string;
  reason: string;
  mode: string;
  targetScore?: number;
  difficulty?: number;
  priority: number;
}

export function EducationView() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);

  // NEXUS adaptive queue state
  const [nexusEnabled, setNexusEnabled] = useState(false);
  const [nexusQueue, setNexusQueue] = useState<NexusQueueItem[]>([]);
  const [nexusLoading, setNexusLoading] = useState(true);

  useEffect(() => {
    let live = true;

    // Fetch static progress
    fetch('/api/education')
      .then((r) => (r?.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        setCompleted(new Set(j?.completed ?? []));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    // Fetch NEXUS adaptive queue (no-ops gracefully if disabled)
    fetch('/api/nexus/queue')
      .then((r) => (r?.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        if (j?.enabled) {
          setNexusEnabled(true);
          setNexusQueue(j?.items ?? []);
        }
        setNexusLoading(false);
      })
      .catch(() => setNexusLoading(false));

    return () => {
      live = false;
    };
  }, []);

  const markComplete = async (trackKey: string, moduleKey: string, lessonKey: string) => {
    const id = `${trackKey}/${moduleKey}/${lessonKey}`;
    if (busy) return;
    setBusy(id);
    try {
      const res = await fetch('/api/education/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackKey, moduleKey, lessonKey }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j?.error ?? 'Failed');
      } else {
        setCompleted((prev) => new Set([...Array.from(prev ?? []), `${trackKey}/${moduleKey}/${lessonKey}`]));
        if (j?.moduleComplete) {
          toast.success(`Module checkpoint! +${j?.credits} LC`);
        } else if (!j?.alreadyDone) {
          toast.success(`Lesson complete! +${j?.credits} LC`);
        }
      }
    } catch {
      toast.error('Failed to save progress');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-7 w-7 text-[#00E5FF]" />
        <div>
          <h1 className="fel-heading text-3xl font-bold text-white">EDUCATION</h1>
          <p className="text-sm text-white/50">Learn the theory. Run the drill. Earn Lab Credits.</p>
        </div>
      </div>

      {/* ── NEXUS Adaptive Queue (shown when platform is enabled) ── */}
      {nexusEnabled && nexusQueue.length > 0 && (
        <section className="mt-8">
          <div className="fel-panel rounded-xl p-5" style={{ borderTop: '2px solid #A855F7' }}>
            <div className="flex items-center gap-3">
              <Brain className="h-6 w-6 text-[#A855F7]" />
              <div>
                <h2 className="fel-heading text-2xl font-bold text-white">NEXUS QUEUE</h2>
                <p className="text-xs text-white/45">Adaptive lessons — personalised by the sequencer</p>
              </div>
              <span className="ml-auto rounded-full bg-[#A855F7]/15 px-3 py-1 font-mono text-xs font-bold text-[#A855F7]">
                {nexusQueue.length} item{nexusQueue.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {nexusQueue.map((item) => {
                const modeInfo = (MODE_INFO as any)?.[item.mode];
                const href = modeInfo?.href ?? '/modes';
                return (
                  <div key={item.id} className="fel-card rounded-lg hover:border-[#A855F7]/30 transition-colors">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Zap className="h-5 w-5 shrink-0 text-[#A855F7]" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-white/85 block truncate">{item.title}</span>
                        <span className="text-xs text-white/40 block truncate">{item.reason}</span>
                      </div>
                      {item.difficulty != null && (
                        <span className="font-mono text-[10px] text-white/30">
                          {'★'.repeat(item.difficulty)}{'☆'.repeat(5 - item.difficulty)}
                        </span>
                      )}
                      <Link
                        href={href}
                        className="fel-heading shrink-0 rounded-md border border-[#A855F7]/40 px-3 py-1.5 text-xs font-bold text-[#A855F7] transition-colors hover:bg-[#A855F7]/15"
                      >
                        LAUNCH
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Static curriculum tracks ── */}
      {TRACKS.map((track) => {
        const trackDone = (track.modules ?? []).reduce(
          (n, m) => n + (m?.lessons ?? []).filter((l) => completed.has(`${track.key}/${m.key}/${l.key}`)).length,
          0
        );
        const trackTotal = (track.modules ?? []).reduce((n, m) => n + (m?.lessons?.length ?? 0), 0);
        return (
          <section key={track.key} className="mt-8">
            <div className="fel-panel rounded-xl p-5" style={{ borderTop: `2px solid ${track.accent}` }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="fel-heading text-2xl font-bold text-white">{track.title}</h2>
                  <p className="text-xs text-white/45">{track.subtitle}</p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold" style={{ color: track.accent }}>
                    {trackDone}/{trackTotal}
                  </span>
                  <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${trackTotal ? (trackDone / trackTotal) * 100 : 0}%`, background: track.accent }}
                    />
                  </div>
                </div>
              </div>

              {(track.modules ?? []).map((mod, mi) => {
                // checkpoint gate: module 2+ locked until previous module complete
                const prevMod = track.modules?.[mi - 1];
                const prevDone = !prevMod || (prevMod.lessons ?? []).every((l) => completed.has(`${track.key}/${prevMod.key}/${l.key}`));
                return (
                  <div key={mod.key} className="mt-5">
                    <div className="flex items-center gap-2">
                      <h3 className="fel-heading text-lg font-bold text-white/85">{mod.title}</h3>
                      {!prevDone && <Lock className="h-4 w-4 text-white/35" />}
                    </div>
                    <div className="mt-2 space-y-2">
                      {(mod.lessons ?? []).map((lesson) => {
                        const id = `${track.key}/${mod.key}/${lesson.key}`;
                        const isDone = completed.has(id);
                        const isOpen = openLesson === id;
                        return (
                          <div
                            key={lesson.key}
                            className={`fel-card rounded-lg transition-colors ${!prevDone ? 'opacity-45' : 'hover:border-white/20'}`}
                          >
                            <button
                              disabled={!prevDone}
                              onClick={() => setOpenLesson(isOpen ? null : id)}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#00FF9D]" />
                              ) : (
                                <Circle className="h-5 w-5 shrink-0 text-white/30" />
                              )}
                              <span className="flex-1 text-sm font-medium text-white/85">{lesson.title}</span>
                              <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>
                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.25 }}
                                  className="overflow-hidden"
                                >
                                  <div className="border-t border-white/5 px-4 py-4">
                                    <p className="text-sm leading-relaxed text-white/65">{lesson.concept}</p>
                                    <div className="mt-3 flex items-start gap-2 rounded-md bg-white/5 px-3 py-2.5">
                                      <Dumbbell className="mt-0.5 h-4 w-4 shrink-0" style={{ color: track.accent }} />
                                      <p className="text-xs text-white/60">
                                        <span className="font-semibold uppercase tracking-wide" style={{ color: track.accent }}>
                                          Linked drill:
                                        </span>{' '}
                                        {lesson.drill}
                                      </p>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <Link
                                        href={track.href}
                                        className="fel-heading rounded-md border border-white/15 px-4 py-2 text-sm font-bold text-white/80 transition-colors hover:border-[#00E5FF]/60 hover:text-[#00E5FF]"
                                      >
                                        RUN DRILL
                                      </Link>
                                      {!isDone && (
                                        <button
                                          onClick={() => markComplete(track.key, mod.key, lesson.key)}
                                          disabled={busy === id}
                                          className="fel-heading flex items-center gap-2 rounded-md bg-[#00E5FF] px-4 py-2 text-sm font-bold text-black transition-all hover:bg-[#00E5FF]/85 disabled:opacity-50"
                                        >
                                          {busy === id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'MARK COMPLETE (+10 LC)'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {!loaded && <p className="mt-6 text-center font-mono text-xs text-white/35">Loading progress…</p>}
    </main>
  );
}
