'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Target, Trophy, Play, Lock } from 'lucide-react';

type LeaderRow = { rank: number; name: string; score: number };
type Sig = {
  mode: string;
  modeLabel: string;
  weekKey: string;
  challengeKey: string;
  modifier: { key: string; name: string; blurb: string };
  targetScore: number;
  leaderboard: LeaderRow[];
  myBest: number | null;
  attemptsToday: number;
  canAttempt: boolean;
};

const PLAY_ROUTE: Record<string, string> = {
  dunkContest: '/play/dunk',
  threePoint: '/play/threepoint',
  hoops1v1: '/play/onevone',
};

function SignatureCard({ sig }: { sig: Sig }) {
  const playHref = `${PLAY_ROUTE[sig.mode] ?? '/'}?signature=1`;
  const beaten = sig.myBest != null && sig.myBest >= sig.targetScore;
  return (
    <div className="fel-panel rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="fel-heading text-lg font-bold text-white">{sig.modeLabel}</div>
          <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFD700]/30 bg-[#FFD700]/10 px-2.5 py-0.5 font-mono text-[10px] text-[#FFD700]">
            {sig.modifier.name}
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 font-mono text-xs text-white/40">
            <Target className="h-3.5 w-3.5" /> TARGET
          </div>
          <div className="fel-heading text-2xl font-bold text-[#00E5FF]">{sig.targetScore}</div>
        </div>
      </div>

      <p className="mt-2 text-xs text-white/55">{sig.modifier.blurb}</p>

      <div className="mt-3 flex items-center justify-between font-mono text-[11px]">
        <span className="text-white/50">
          Your best:{' '}
          <span className={beaten ? 'text-[#00FF9D]' : 'text-white/80'}>
            {sig.myBest ?? '—'}
          </span>
          {beaten && <span className="ml-1 text-[#00FF9D]">✓ beaten</span>}
        </span>
        <span className="text-white/40">Week {sig.weekKey}</span>
      </div>

      {sig.canAttempt ? (
        <Link
          href={playHref}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#00E5FF] px-4 py-2.5 fel-heading font-bold text-black transition-transform hover:scale-[1.02]"
        >
          <Play className="h-4 w-4" /> PLAY TODAY&apos;S ATTEMPT
        </Link>
      ) : (
        <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 font-mono text-xs text-white/40">
          <Lock className="h-3.5 w-3.5" /> Come back tomorrow — 1 attempt/day
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-white/40">
          <Trophy className="h-3.5 w-3.5 text-[#FFD700]" /> Leaderboard
        </div>
        {sig.leaderboard.length === 0 ? (
          <div className="rounded-lg border border-white/5 py-4 text-center font-mono text-[11px] text-white/30">
            Be the first to post a score.
          </div>
        ) : (
          <ol className="space-y-1">
            {sig.leaderboard.map((r) => (
              <li key={r.rank} className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-1.5 font-mono text-xs">
                <span className="text-white/70">
                  <span className="mr-2 text-white/40">#{r.rank}</span>
                  {r.name}
                </span>
                <span className="font-bold text-[#00E5FF]">{r.score}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export function SignatureView() {
  const [sigs, setSigs] = useState<Sig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/signature', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setSigs(j.signatures ?? []))
      .catch((e) => setError(e?.message ?? 'Failed to load'));
  }, []);

  if (error) {
    return <div className="mt-8 font-mono text-sm text-[#FF3366]">Error loading challenges: {error}</div>;
  }
  if (!sigs) {
    return (
      <div className="mt-16 flex justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#00E5FF]" />
      </div>
    );
  }
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sigs.map((s) => (
        <SignatureCard key={s.challengeKey} sig={s} />
      ))}
    </div>
  );
}
