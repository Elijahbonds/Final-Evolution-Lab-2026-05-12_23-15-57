'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
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
  const babylon = isBabylon('hoops3v3');
  const Game = babylon ? ThreeVThreeBabylon : is3D('hoops3v3') ? ThreeVThree3D : ThreeVThree2D;
  return <GameShell mode="hoops3v3" title="THREES" venue="Venice Beach Court" Game={Game} ownControls={babylon} />;
}
