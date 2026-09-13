'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

// THE BABYLON MODE, not the Canvas-2D one (2026-09-13). `BrainBrawlMode` has been in the registry the whole
// time and was reachable from nowhere: the key was never in ENABLED_BABYLON_MODES and this loader rendered
// `brain-brawl-game`, the 2D fallback. So the 3D mode existed, booted clean at 60 fps when probed directly,
// and no player could ever get to it — the quietest possible way for finished work to be invisible.
const BrainBrawlBabylon = dynamicImport(() => import('@/components/games/brainbrawl-babylon'), { ssr: false, loading: spinner });

export function BrainBrawlLoader() {
  return <GameShell mode="brainBrawl" title="BRAIN BRAWL" venue="NeuroArena" Game={BrainBrawlBabylon} />;
}
