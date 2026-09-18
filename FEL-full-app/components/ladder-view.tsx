'use client';

// LadderView — pass 5 phase 4: the player-facing mastery ladder. Three things the vision asked to be FELT:
// where you stand this week (LadderSeason / LadderEntry), how the last seasons went, and your PRQ grade trend.
// Everything on screen comes from /api/ladder/enter (GET), /api/ladder/results (GET) and /api/profile.
import { useEffect, useState } from 'react';
import { Trophy, TrendingUp, Medal, Loader2 } from 'lucide-react';

interface Entry { userId?: string; name?: string; bestScore: number; rank?: number; isMe?: boolean }
interface Season { id: string; weekStart: string; weekEnd?: string; mode: string; prizePool: number; finalized?: boolean }
interface Past { id: string; weekStart: string; mode: string; prizePool: number; winners: { rank: number; name: string; bestScore: number; prize: number }[] }

export function LadderView() {
  const [current, setCurrent] = useState<{ season: Season | null; entries: Entry[] } | null>(null);
  const [past, setPast] = useState<Past[]>([]);
  const [prq, setPrq] = useState<{ prq: number; grade?: { label?: string; color?: string } } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch('/api/ladder/enter').then((r) => (r.ok ? r.json() : { season: null, entries: [] })),
      fetch('/api/ladder/results').then((r) => (r.ok ? r.json() : { seasons: [] })),
      fetch('/api/profile').then((r) => (r.ok ? r.json() : null)),
    ]).then(([cur, res, prof]) => {
      if (!live) return;
      setCurrent({ season: cur?.season ?? null, entries: (cur?.entries ?? []).map((e: Entry, i: number) => ({ ...e, rank: i + 1 })) });
      setPast(res?.seasons ?? []);
      setPrq(prof ? { prq: prof.prq ?? 0, grade: prof.grade } : null);
      setState('ready');
    }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, []);

  const me = current?.entries.find((e) => e.isMe);
  return (
    <main className="mx-auto max-w-[900px] px-4 py-6">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="fel-heading text-3xl font-bold">MASTERY LADDER</h1>
        {prq && (
          <div className="flex items-center gap-2 font-mono text-sm" style={{ color: prq.grade?.color ?? '#00FF9D' }}>
            <TrendingUp className="h-4 w-4" /> PRQ {Math.round(prq.prq)} · {prq.grade?.label ?? 'READY'}
          </div>
        )}
      </div>
      {state === 'loading' && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#00E5FF]" /></div>}
      {state === 'error' && <p className="text-white/60">The ladder could not load. Try again in a moment.</p>}
      {state === 'ready' && (
        <>
          <section className="mb-8 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-white/50">
              <Trophy className="h-4 w-4 text-[#FFD700]" /> This week{current?.season ? ` · ${current.season.mode} · ${current.season.prizePool.toLocaleString('en-US')} LC pool` : ''}
            </div>
            {!current?.season ? (
              <p className="text-white/60">No season is open this week yet. Play a ranked mode and enter from the Arena to open it.</p>
            ) : current.entries.length === 0 ? (
              <p className="text-white/60">The board is empty. The first entry sets the bar.</p>
            ) : (
              <ol className="divide-y divide-white/5">
                {current.entries.slice(0, 20).map((e) => (
                  <li key={`${e.userId ?? e.name}-${e.rank}`} className={`flex items-center justify-between py-2 font-mono text-sm ${e.isMe ? 'text-[#00E5FF]' : 'text-white/80'}`}>
                    <span className="flex items-center gap-3"><span className="w-6 text-right text-white/40">{e.rank}</span>{e.name ?? 'Anon'}{e.isMe ? ' · you' : ''}</span>
                    <span className="tabular-nums">{e.bestScore.toLocaleString('en-US')}</span>
                  </li>
                ))}
              </ol>
            )}
            {me && <p className="mt-3 font-mono text-xs text-white/50">Your standing: #{me.rank} of {current?.entries.length}</p>}
          </section>
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-white/50"><Medal className="h-4 w-4 text-[#A855F7]" /> Recent seasons</div>
            {past.length === 0 ? <p className="text-white/60">No season has finalized yet.</p> : (
              <div className="grid gap-3 sm:grid-cols-2">
                {past.map((s) => (
                  <div key={s.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className="mb-2 font-mono text-xs text-white/50">{new Date(s.weekStart).toLocaleDateString()} · {s.mode} · {s.prizePool.toLocaleString('en-US')} LC</div>
                    <ol className="space-y-1 font-mono text-sm">
                      {s.winners.map((w) => (<li key={w.rank} className="flex justify-between text-white/80"><span>#{w.rank} {w.name}</span><span className="tabular-nums">{w.bestScore.toLocaleString('en-US')} · +{w.prize} LC</span></li>))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
