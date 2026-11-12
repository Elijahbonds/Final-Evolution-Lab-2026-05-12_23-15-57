'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

const ThreePoint2D = dynamicImport(() => import('@/components/games/three-point-game'), {
  ssr: false,
  loading: spinner,
});

const ThreePoint3D = dynamicImport(() => import('@/components/games/three-point-3d'), {
  ssr: false,
  loading: spinner,
});

// Babylon port (ThreePointMode.ts) — also the Controller Link reference host.
const ThreePointBabylon = dynamicImport(() => import('@/components/games/three-point-babylon'), {
  ssr: false,
  loading: spinner,
});

export function ThreePointLoader() {
  const babylon = isBabylon('threePoint');
  const Game = babylon ? ThreePointBabylon : is3D('threePoint') ? ThreePoint3D : ThreePoint2D;
  return (
    <GameShell
      mode="threePoint"
      title="DOWNTOWN"
      venue="Venice Beach Court"
      Game={Game}
      ownControls={babylon}
    />
  );
}
