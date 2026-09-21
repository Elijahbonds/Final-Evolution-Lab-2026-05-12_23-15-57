'use client';
// NEEDS YOU TODAY — the top of the Clients tab.
//
// lib/coach/triage.ts and lib/coach/compliance.ts were written, tested and imported by nothing: the dashboard has
// shown programs, an inbox and a roster since it was built, and none of the judgement behind it. The brief this
// came from asks for "one coach manages 50+ clients without manually reviewing dozens of video uploads daily",
// and a roster list does not do that — a roster shows fifty rows and leaves the reading to the coach. This shows
// the six that need reading, and says WHY and WHAT TO DO for each.
//
// Good news is a row too. A screen that only ever reports problems is a screen a coach stops opening.

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Loader2, MoonStar, Timer, TrendingDown } from 'lucide-react';

interface Flag {
  clientId: string; displayName: string; kind: string;
  urgency: number; observed: string; action: string; positive: boolean;
}
interface DriftRow { clientId: string; name: string; state: string; daysSince: number | null; note: string }
interface Board {
  triage: { flags: Flag[]; totalFlagged: number; clear: number; summary: string };
  drift: DriftRow[];
  headline: string | null;
}

const ICON: Record<string, typeof AlertTriangle> = {
  'gone-quiet': MoonStar,
  'stale-scan': Timer,
  'off-baseline': TrendingDown,
  'under-recovered': AlertTriangle,
  'ready-to-progress': ArrowUpRight,
};

export function AttentionPanel() {
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/coach/attention')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setBoard)
      .catch(() => setFailed(true));
  }, []);

  // A panel that cannot load says so and gets out of the way; it never blocks the roster underneath it.
  if (failed) return null;
  if (!board) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/6 bg-[#0f0f13] p-4 text-sm text-white/40">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading your roster…
      </div>
    );
  }

  const waiting = board.drift.filter((d) => d.state === 'awaitingProgram');

  return (
    <section className="mb-4 rounded-xl border border-white/6 bg-[#0f0f13] p-4" aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="text-sm font-semibold text-white/80">Needs you today</h2>
      <p className="mt-0.5 text-xs text-white/45">{board.headline ?? board.triage.summary}</p>

      {/* Someone waiting on programming is waiting on THIS coach, so they come first and are named. */}
      {waiting.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {waiting.map((d) => (
            <li key={d.clientId} className="flex items-start gap-2 rounded-lg bg-[#FFD700]/8 px-3 py-2 text-sm">
              <Timer className="mt-0.5 h-4 w-4 shrink-0 text-[#FFD700]" aria-hidden="true" />
              <span><span className="font-medium text-white/90">{d.name}</span>{' '}
                <span className="text-white/55">{d.note}</span></span>
            </li>
          ))}
        </ul>
      )}

      {board.triage.flags.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {board.triage.flags.map((f) => {
            const Icon = ICON[f.kind] ?? AlertTriangle;
            return (
              <li
                key={`${f.clientId}:${f.kind}`}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${f.positive ? 'bg-[#00FF9D]/8' : 'bg-white/4'}`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${f.positive ? 'text-[#00FF9D]' : 'text-[#FF3366]'}`} aria-hidden="true" />
                <span>
                  <span className="font-medium text-white/90">{f.displayName}</span>{' '}
                  <span className="text-white/55">{f.observed}</span>{' '}
                  <span className="text-white/80">{f.action}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        waiting.length === 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm text-white/55">
            <CheckCircle2 className="h-4 w-4 text-[#00FF9D]" aria-hidden="true" />
            {board.triage.clear > 0 ? `All ${board.triage.clear} training normally.` : 'Nothing to read yet.'}
          </p>
        )
      )}
    </section>
  );
}
