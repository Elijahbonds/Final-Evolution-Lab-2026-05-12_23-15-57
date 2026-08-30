'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { isBabylon } from '@/components/three/flags';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const Sprint2D = dynamicImport(() => import('@/components/games/sprint-game'), {
  ssr: false, loading: spinner,
});

// Babylon 100m on the shared SprintCore (lib/babylon/modes/SprintMode.ts).
const SprintBabylon = dynamicImport(
  () => import('@/components/games/sprint-babylon').then((m) => ({
    default: m.makeSprintHost('sprint', 'BEACH SPRINT'),
  })),
  { ssr: false, loading: spinner },
);

export function SprintLoader() {
  const babylon = isBabylon('sprint');
  const Game = babylon ? SprintBabylon : Sprint2D;
  return <GameShell mode="sprint" title="BEACH SPRINT" venue="Muscle Beach Gym" Game={Game} ownControls={babylon} />;
}
