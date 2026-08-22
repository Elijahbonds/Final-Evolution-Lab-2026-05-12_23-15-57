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

const OneVOne2D = dynamicImport(() => import('@/components/games/one-v-one-game'), {
  ssr: false,
  loading: spinner,
});

const OneVOne3D = dynamicImport(() => import('@/components/games/basketball-3d'), {
  ssr: false,
  loading: spinner,
});

// Babylon.js 1V1 hoops stage (M48) on PlayerSlot + BasketballCore.
const OneVOneBabylon = dynamicImport(() => import('@/components/games/basketball-babylon'), {
  ssr: false,
  loading: spinner,
});

export function OneVOneLoader() {
  const Game = isBabylon('hoops1v1') ? OneVOneBabylon : is3D('hoops1v1') ? OneVOne3D : OneVOne2D;
  return <GameShell mode="hoops1v1" title="1V1 HOOPS" venue="Venice Beach Court" Game={Game} />;
}
