'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PartyPopper, Trophy, RotateCcw, Home } from 'lucide-react';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import {
  type CarnivalRunState, peekCarnivalRun, clearCarnivalRun, carnivalStopLabel, carnivalRunTotalScore,
} from '@/lib/carnival-run';

export function CarnivalRecapClient() {
  const [run, setRun] = useState<CarnivalRunState | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setRun(peekCarnivalRun());
  }, []);

  const finish = () => {
    clearCarnivalRun();
    setCleared(true);
  };

  const total = run ? carnivalRunTotalScore(run) : 0;
  const best = run?.results.reduce((b, r) => (r.score > (b?.score ?? -1) ? r : b), run.results[0]);

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <main className="mx-auto max-w-[560px] px-4 py-8 text-center">
        {!run || cleared ? (
          <div className="fel-card rounded-2xl p-8">
            <p className="text-white/60">No carnival night in progress.</p>
            <Link
              href="/play/carnival"
              onClick={() => clearCarnivalRun()}
              className="fel-heading mt-4 inline-flex items-center gap-2 rounded-md bg-[#FFD700] px-5 py-3 text-sm font-bold text-black hover:bg-[#FFD700]/85"
            >
              <PartyPopper className="h-4 w-4" /> START A NEW NIGHT
            </Link>
          </div>
        ) : (
          <div className="fel-panel rounded-2xl p-8">
            <PartyPopper className="mx-auto h-12 w-12 text-[#FFD700]" />
            <h1 className="fel-heading mt-3 text-4xl font-bold text-white">CARNIVAL NIGHT COMPLETE</h1>
            <p className="mt-1 font-mono text-lg text-[#FFD700]">Total score: {total}</p>

            <div className="mt-6 space-y-2 text-left">
              {run.results.map((r, i) => (
                <div
                  key={`${r.stop}-${i}`}
                  className={`fel-card flex items-center justify-between rounded-lg px-4 py-3 ${
                    best && r === best ? 'border-[#FFD700]/50 bg-[#FFD700]/[0.06]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {best && r === best && <Trophy className="h-4 w-4 text-[#FFD700]" />}
                    <span className="text-sm font-semibold text-white">{carnivalStopLabel(r.stop)}</span>
                  </div>
                  <span className="font-mono text-sm text-white/70">
                    {r.score} {r.won && <span className="text-[#00FF9D]">· WON</span>}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <Link
                href="/play/carnival"
                onClick={finish}
                className="fel-heading flex flex-1 items-center justify-center gap-2 rounded-md bg-[#FFD700] py-3 text-sm font-bold text-black transition-all hover:bg-[#FFD700]/85"
              >
                <RotateCcw className="h-4 w-4" /> ANOTHER NIGHT
              </Link>
              <Link
                href="/"
                onClick={finish}
                className="fel-heading flex flex-1 items-center justify-center gap-2 rounded-md border border-white/15 py-3 text-sm font-bold text-white/80 transition-colors hover:border-[#00E5FF]/60 hover:text-[#00E5FF]"
              >
                <Home className="h-4 w-4" /> HUB
              </Link>
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
