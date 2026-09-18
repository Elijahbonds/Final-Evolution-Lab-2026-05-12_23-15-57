'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { is3D } from '@/components/three/flags';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const ThreePoint2D = dynamicImport(() => import('@/components/games/three-point-game'), {
  ssr: false,
  loading: spinner,
});

const ThreePoint3D = dynamicImport(() => import('@/components/games/three-point-3d'), {
  ssr: false,
  loading: spinner,
});

export function ThreePointLoader() {
  const Game = is3D('threePoint') ? ThreePoint3D : ThreePoint2D;
  return <GameShell mode="threePoint" title="THREE-POINT SHOOTOUT" venue="Venice Beach Court" Game={Game} />;
}
