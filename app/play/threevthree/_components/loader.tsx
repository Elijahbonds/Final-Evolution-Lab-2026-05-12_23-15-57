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

const ThreeVThree2D = dynamicImport(() => import('@/components/games/three-v-three-game'), {
  ssr: false,
  loading: spinner,
});

const ThreeVThree3D = dynamicImport(() => import('@/components/games/three-v-three-3d'), {
  ssr: false,
  loading: spinner,
});

// Babylon.js 3V3 streetball stage (M48) on PlayerSlot + BasketballCore.
const ThreeVThreeBabylon = dynamicImport(() => import('@/components/games/three-v-three-babylon'), {
  ssr: false,
  loading: spinner,
});

export function ThreeVThreeLoader() {
  const Game = isBabylon('hoops3v3') ? ThreeVThreeBabylon : is3D('hoops3v3') ? ThreeVThree3D : ThreeVThree2D;
  return <GameShell mode="hoops3v3" title="3V3 STREETBALL" venue="Venice Beach Court" Game={Game} />;
}
