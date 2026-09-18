'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const DunkGame2D = dynamicImport(() => import('@/components/games/dunk-game'), {
  ssr: false,
  loading: spinner,
});

const DunkGame3D = dynamicImport(() => import('@/components/games/dunk-game-3d'), {
  ssr: false,
  loading: spinner,
});

// Babylon.js dunk stage (M22–M27 rebuild) — the proof gate for the new engine.
const DunkBabylon = dynamicImport(() => import('@/components/games/dunk-babylon'), {
  ssr: false,
  loading: spinner,
});

export function DunkLoader() {
  const Game = isBabylon('dunkContest') ? DunkBabylon : is3D('dunkContest') ? DunkGame3D : DunkGame2D;
  return <GameShell mode="dunkContest" title="DUNK CONTEST" venue="Venice Beach Court" Game={Game} />;
}
