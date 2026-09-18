'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

// Babylon-only (no 2D fallback exists for this mode).
const ShowdownBabylon = dynamicImport(() => import('@/components/games/showdown-babylon'), {
  ssr: false, loading: spinner,
});

export function ShowdownLoader() {
  return <GameShell mode="showdown" title="SHOWDOWN" venue="Shimogamo Dojo" Game={ShowdownBabylon} ownControls />;
}
