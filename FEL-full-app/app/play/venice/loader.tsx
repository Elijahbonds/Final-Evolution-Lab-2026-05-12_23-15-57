'use client';

import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { GameLoading } from '@/components/games/game-loading';

// The Babylon stage is client-only (WebGL); the page stays a server component (its metadata and the session read).
const Stage = dynamicImport(() => import('./stage').then((m) => ({ default: m.VeniceStage })), { ssr: false, loading: () => <GameLoading className="min-h-[60vh]" /> });

export function VeniceLoader({ signedIn }: { signedIn: boolean }) {
  // The way back lives HERE, outside the client-only stage, so it is in the server's HTML: inside the stage it appeared only once
  // the stage's chunk loaded — measured 3.0-3.7 s after navigation (scripts/probes/venice-hub/backlink.mts), a dead end until
  // then (every-screen read it as one, 1 of 2 runs on 2026-11-18). The Play shelf, where every game is still one tap.
  return (
    <>
      <Stage signedIn={signedIn} />
      <Link href="/play" data-testid="venice-back" aria-label="Back to Play"
        className="fixed left-3 top-3 z-20 inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full bg-black/60 px-3 text-base font-bold text-white">
        <ChevronLeft aria-hidden className="h-5 w-5" /> Play
      </Link>
    </>
  );
}
