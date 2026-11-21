'use client';

import { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { GameLoading } from '@/components/games/game-loading';
import { veniceReturnHref } from '@/lib/adventure/coast/door';

// The Babylon stage is client-only (WebGL); the page stays a server component (its metadata and the session read).
const Stage = dynamicImport(() => import('./stage').then((m) => ({ default: m.CoastStage })), { ssr: false, loading: () => <GameLoading className="min-h-[60vh]" /> });

/**
 * The way back to Venice is drawn HERE, outside the stage's chunk (coast-b, every-screen): it is on screen from the first paint,
 * while the 3D stage is still downloading, so the page is never a dead end and the link answers a tap without waiting for it.
 */
export function CoastLoader({ signedIn }: { signedIn: boolean }) {
  const [back, setBack] = useState('/play/venice');
  useEffect(() => { setBack(veniceReturnHref(window.location.search)); }, []);
  return (
    <>
      <Stage signedIn={signedIn} back={back} />
      <Link href={back} data-testid="coast-back" aria-label="Back to Venice"
        className="fixed left-3 top-3 z-30 inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-full bg-black/60 px-3 text-base font-bold text-white">
        <ChevronLeft aria-hidden className="h-5 w-5" /> Venice
      </Link>
    </>
  );
}
