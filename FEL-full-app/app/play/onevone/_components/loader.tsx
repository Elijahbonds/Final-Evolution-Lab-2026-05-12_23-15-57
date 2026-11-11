'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
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
  const babylon = isBabylon('hoops1v1');
  const Game = babylon ? OneVOneBabylon : is3D('hoops1v1') ? OneVOne3D : OneVOne2D;
  return <GameShell mode="hoops1v1" title="ONES" venue="Venice Beach Court" Game={Game} ownControls={babylon} />;
}
