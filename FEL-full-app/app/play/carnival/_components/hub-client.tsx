'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, PartyPopper, ArrowRight } from 'lucide-react';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { CarnivalLoader } from './loader';
import {
  drawCarnivalLineup, startCarnivalRun, carnivalStopHref, carnivalStopLabel,
} from '@/lib/carnival-run';

/** Court Carnival's landing page. Mid-run (URL carries ?carnival=1, set by
 *  GameShell's relay when navigating between stops) it drops straight into
 *  the Babylon game like any other stop. Otherwise it's the "tonight's
 *  lineup" briefing that kicks a whole party-night run — a shuffled mix of
 *  the native 3D round and the quick mini-game pages — off from stop one. */
export function CarnivalHubClient() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#050505]"><Loader2 className="h-8 w-8 animate-spin text-[#FFD700]" /></div>}>
      <CarnivalHubInner />
    </Suspense>
  );
}

function CarnivalHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inRun = searchParams.get('carnival') === '1';
  // drawCarnivalLineup() shuffles with Math.random() — computing it inside
  // useState's initializer ran it once during SSR and again independently
  // on the client during hydration, so the server-rendered lineup order
  // and the client's never matched (React error #418/#425, forcing a full
  // client re-render every load). Rolling it in an effect keeps the FIRST
  // render (server and client alike) as the identical empty/loading state;
  // only the client ever actually draws the shuffle.
  const [lineup, setLineup] = useState<ReturnType<typeof drawCarnivalLineup> | null>(null);
  useEffect(() => { setLineup(drawCarnivalLineup()); }, []);

  const startNight = () => {
    if (!lineup) return;
    const run = startCarnivalRun(lineup);
    router.push(carnivalStopHref(run.lineup[0]));
  };

  if (inRun) return <CarnivalLoader />;

  if (!lineup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FFD700]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <main className="mx-auto max-w-[560px] px-4 py-8 text-center">
        <div className="fel-panel rounded-2xl p-8">
          <PartyPopper className="mx-auto h-12 w-12 text-[#FFD700]" />
          <h1 className="fel-heading mt-3 text-3xl font-bold text-white">COURT CARNIVAL</h1>
          <p className="mt-1 text-sm text-white/50">Venice Beach Carnival — a party night of quick bursts, back to back.</p>

          <div className="mt-6 space-y-2 text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-white/40">Tonight&apos;s lineup</p>
            {lineup.map((stop, i) => (
              <div key={`${stop}-${i}`} className="fel-card flex items-center gap-3 rounded-lg px-4 py-3">
                <span className="fel-heading flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFD700]/15 text-xs font-bold text-[#FFD700]">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-white">{carnivalStopLabel(stop)}</span>
              </div>
            ))}
          </div>

          <button
            onClick={startNight}
            className="fel-heading mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-[#FFD700] py-3.5 text-base font-bold text-black transition-all hover:bg-[#FFD700]/85"
          >
            <ArrowRight className="h-4 w-4" /> START THE NIGHT
          </button>
          <p className="mt-3 text-[11px] text-white/35">Every stop still earns its own XP, shards, and credits.</p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
