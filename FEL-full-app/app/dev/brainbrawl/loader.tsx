'use client';

// Dev-only host for the real Babylon BrainBrawlMode (BRAINBRAWL-MAJOR, 2026-09-24).
//
// Exists for the same reason /dev/threepoint does: /play/brain-brawl is auth-gated and the local database is down, and
// the generic /dev/mode runner draws its own debug HUD — not the challenge card. The card IS half of this mode (the
// question, the four answers, the reveal), so it has to be looked at through the SAME component /play/brain-brawl
// mounts, with stub GameProps. Real ModeHarness, real mode, real card. Nothing here is a mock.
//
// BRAINBRAWL-RESIDUAL (2026-09-24): it also stands in for the shell's end card — the same ReplayInPlaceContext GameShell
// provides, and a REPLAY button that calls it the way GameShell.replay() does — so GO AGAIN in place can be driven here.
//
// BRAINBRAWL-POLISH-2 (2026-09-24): `?shell=1` mounts the REAL shell instead — BrainBrawlLoader, exactly what /play/brain-brawl
// renders (GameShell and its results card) — for looking at the end card's rewards. The shell's own fetches (/api/profile,
// /api/sessions, /api/v1/wallet/earn) go to this server as they would on /play; without a signed-in session they need the probe
// to answer them.

import { useCallback, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { prqGrade } from '@/lib/prq';
import type { GameResult } from '@/components/games/game-shell';
import { ReplayInPlaceContext } from '@/components/games/replay-in-place';
import { BrainBrawlLoader } from '@/app/play/brain-brawl/_components/loader';

const BrainBrawl = dynamicImport(() => import('@/components/games/brainbrawl-babylon'), { ssr: false });

export function DevBrainBrawlLoader({ shell = false }: { shell?: boolean }) {
  const inPlace = useRef<(() => boolean) | null>(null);
  const register = useCallback((fn: (() => boolean) | null) => { inPlace.current = fn; }, []);
  const [ended, setEnded] = useState<GameResult | null>(null);
  const [remounts, setRemounts] = useState(0);
  const onEnd = useCallback((r: GameResult) => { console.log('[dev] mode ended', JSON.stringify(r)); setEnded(r); }, []);
  const replay = () => {
    setEnded(null);
    if (inPlace.current?.()) { console.log('[dev] replay in place'); return; }
    console.log('[dev] replay by remount'); setRemounts((k) => k + 1);
  };
  if (shell) return <BrainBrawlLoader />;
  return (
    <div className="min-h-screen bg-[#07090d] p-4">
      <p className="mb-3 font-mono text-xs text-white/40">
        DEV · real BrainBrawlMode via ModeHarness · benchmark: Trivia Crack wheel × Big Brain Academy
      </p>
      <div className="relative">
        <ReplayInPlaceContext.Provider value={register}>
          <BrainBrawl key={remounts} grade={prqGrade(72)} prq={72} onEnd={onEnd} />
        </ReplayInPlaceContext.Provider>
        {ended && (
          <div data-dev="end-card" className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 font-mono">
            <div className="rounded-xl border border-white/20 bg-[#0b0d14] px-6 py-4 text-center text-white">
              <div className="text-lg font-black">{ended.headline} · {ended.score}</div>
              <button data-dev="replay" onClick={replay} className="mt-3 rounded-md border border-[#00E5FF]/60 px-4 py-2 text-sm text-[#00E5FF]">REPLAY</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
