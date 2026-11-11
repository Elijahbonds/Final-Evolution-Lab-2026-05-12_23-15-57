'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const SkateboardGame2D = dynamicImport(() => import('@/components/games/skateboard-game'), {
  ssr: false,
  loading: () => (
    <GameLoading />
  ),
});

const Skateboard3D = dynamicImport(() => import('@/components/games/board-skate-3d'), {
  ssr: false,
  loading: () => (
    <GameLoading />
  ),
});

const SkateboardBabylon = dynamicImport(
  () => import('@/components/games/board-babylon').then((m) => ({
    default: m.makeBoardHost({ modeKey: 'skateboard', tag: 'FEL-SKATE', tricks: ['KICKFLIP', 'HEELFLIP', 'GRAB'], hint: 'Steer · hold PUMP · JUMP to ollie/grind · tricks in air' }),
  })),
  {
    ssr: false,
    loading: () => (
      <GameLoading />
    ),
  },
);

export function SkateboardLoader() {
  const babylon = isBabylon('skateboard');
  const Game = babylon ? SkateboardBabylon : is3D('skateboard') ? Skateboard3D : SkateboardGame2D;
  return <GameShell mode="skateboarding" title="VENICE LINES" venue="Venice Skatepark" Game={Game} ownControls={babylon} />;
}
