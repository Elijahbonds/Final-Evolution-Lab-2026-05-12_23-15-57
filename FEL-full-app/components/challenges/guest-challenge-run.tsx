'use client';

// CHALLENGES-2: a guest plays a friend's challenge with no account (owner, 2026-10-22: play first).
//
// The /try rule, unchanged (TIP-GUEST-TOKEN-HASH Part A): the year question comes FIRST and nothing leaves the browser
// before it is answered. An adult answer starts the guest (POST /api/guest) and the attempt is settled on the server,
// where the result is kept on the guest row for sign-up to carry over. A teen answer, "play without saving", or the
// block flag plays the same run locally: the result is worked out on this page against the score on the link and is
// never sent. The mode is the same Babylon host /play mounts, with no GameShell (as /try mounts the dunk).

import dynamicImport from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { prqGrade } from '@/lib/prq';
import { AgeStep, ageBlockPresent, writeAgeBlockFlag } from '@/components/age-step';
import { ageScreenOutcome } from '@/lib/privacy/ageScreen';
import type { GameProps, GameResult } from '@/components/games/game-shell';
import { formatChallengeScore, outcomeOf, type ChallengeOutcome } from '@/lib/social/challenge-terms';
import { ChallengeResultCard, type ResultViewer } from './challenge-result-card';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

/** The guest hosts (lib/social/challenge-guest-play.ts GUEST_HOST_MODES). */
const HOSTS: Record<string, React.ComponentType<GameProps>> = {
  threePoint: dynamicImport(() => import('@/components/games/three-point-babylon'), { ssr: false, loading: spinner }) as React.ComponentType<GameProps>,
};

type Gate = 'ask' | 'blocked' | 'local' | 'adult';
type Done = { outcome: ChallengeOutcome; mine: number; theirs: number; viewer: ResultViewer };

export function GuestChallengeRun({ code, modeKey, title, targetScore, theirName }: {
  code: string; modeKey: string; title: string; targetScore: number; theirName: string;
}) {
  const Game = HOSTS[modeKey];
  const [gate, setGate] = useState<Gate>('ask');
  const [done, setDone] = useState<Done | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const online = useRef(false);

  useEffect(() => {
    if (gate === 'ask' && ageBlockPresent()) setGate('blocked');
  }, [gate]);

  const startGuest = () => {
    online.current = true;
    setGate('adult');
    fetch('/api/guest', { method: 'POST' }).catch(() => {});
  };

  const onEnd = useCallback(async (res: GameResult) => {
    const mine = Math.round(Number(res?.score ?? 0));
    if (online.current) {
      try {
        const r = await fetch(`/api/challenge/${encodeURIComponent(code)}/attempt`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptScore: mine }),
        });
        const j = r.ok ? await r.json() : null;
        if (j && typeof j.outcome === 'string') {
          setDone({ outcome: j.outcome, mine: j.attemptScore, theirs: j.targetScore, viewer: 'guest' });
          return;
        }
      } catch { /* fall through to the page's own reading */ }
    }
    setDone({ outcome: outcomeOf(targetScore, mine), mine, theirs: targetScore, viewer: gate === 'blocked' ? 'blocked' : online.current ? 'guest' : 'local' });
  }, [code, targetScore, gate]);

  if (!Game) return null;
  const fmt = (n: number) => formatChallengeScore({ metric: null }, n);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-2 py-3 sm:px-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{title}</div>
          <div className="truncate text-sm text-white/80">Beat {fmt(targetScore)} from {theirName}</div>
        </div>
        <a href={`/c/${encodeURIComponent(code)}`} className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 font-mono text-[10px] text-white/45">QUIT</a>
      </div>
      {gate === 'ask' ? (
        <div className="py-6" data-testid="challenge-age-step">
          <AgeStep mode="signup" onLocked={(year) => (ageScreenOutcome(year) === 'adult' ? startGuest() : setGate('local'))} onBlocked={() => { writeAgeBlockFlag(); setGate('blocked'); }} />
          <button type="button" onClick={() => setGate('local')} className="mx-auto mt-4 block font-mono text-xs text-white/45 hover:text-white">
            Play without saving
          </button>
        </div>
      ) : done ? (
        <div className="mx-auto max-w-md py-4">
          <ChallengeResultCard
            code={code} title={title} outcome={done.outcome} myScore={fmt(done.mine)} theirScore={fmt(done.theirs)} theirName={theirName}
            viewer={done.viewer} playAgainHref={null}
          />
          <button type="button" onClick={() => { setDone(null); setGameKey((k) => k + 1); }} className="mx-auto mt-4 block font-mono text-xs text-white/50 hover:text-white" data-action="play-again">
            Play it again
          </button>
        </div>
      ) : (
        <Game key={gameKey} grade={prqGrade(50)} prq={50} onEnd={onEnd} />
      )}
    </div>
  );
}
