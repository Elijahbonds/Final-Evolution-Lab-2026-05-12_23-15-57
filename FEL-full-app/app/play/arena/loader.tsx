'use client';

import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { GameLoading } from '@/components/games/game-loading';

// The Babylon stage is client-only (WebGL); the page stays a server component (its metadata and the session read).
const Stage = dynamicImport(() => import('./stage').then((m) => ({ default: m.ArenaStage })), { ssr: false, loading: () => <GameLoading className="min-h-[60vh]" /> });

export function ArenaLoader({ signedIn }: { signedIn: boolean }) {
  // The way back is in the server's HTML from the first paint (Venice's lesson: inside the stage it was a dead end until the chunk loaded).
  return (
    <>
      <Stage signedIn={signedIn} />
      <Link href="/play" data-testid="arena-back" aria-label="Back to Play"
        className="fixed left-3 top-3 z-20 inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full bg-black/60 px-3 text-base font-bold text-white">
        <ChevronLeft aria-hidden className="h-5 w-5" /> Play
      </Link>
    </>
  );
}
