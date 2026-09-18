'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const BrainBrawlGame = dynamicImport(() => import('@/components/games/brain-brawl-game'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
    </div>
  ),
});

export function BrainBrawlLoader() {
  return <GameShell mode="brainBrawl" title="BRAIN BRAWL" venue="NeuroArena" Game={BrainBrawlGame} />;
}
