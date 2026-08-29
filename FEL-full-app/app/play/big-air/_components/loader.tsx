'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { is3D } from '@/components/three/flags';

const BigAirGame2D = dynamicImport(() => import('@/components/games/big-air-game'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
    </div>
  ),
});

const BigAir3D = dynamicImport(() => import('@/components/games/big-air-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
    </div>
  ),
});

export function BigAirLoader() {
  const Game = is3D('bigAir') ? BigAir3D : BigAirGame2D;
  return <GameShell mode="bigAir" title="BIG AIR" venue="Mountain Slope" Game={Game} />;
}
