'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const SurfGame2D = dynamicImport(() => import('@/components/games/surf-game'), {
  ssr: false,
  loading: () => (
    <GameLoading />
  ),
});

const Surf3D = dynamicImport(() => import('@/components/games/board-surf-3d'), {
  ssr: false,
  loading: () => (
    <GameLoading />
  ),
});

const SurfBabylon = dynamicImport(
  () => import('@/components/games/board-babylon').then((m) => ({
    default: m.makeBoardHost({ modeKey: 'surf', tag: 'FEL-SURF', tricks: ['CUTBACK', 'AIR', 'GRAB'], hint: 'Steer the pocket · hold PUMP · JUMP for air · tricks off the lip' }),
  })),
  {
    ssr: false,
    loading: () => (
      <GameLoading />
    ),
  },
);

export function SurfLoader() {
  const babylon = isBabylon('surf');
  const Game = babylon ? SurfBabylon : is3D('surfing') ? Surf3D : SurfGame2D;
  return <GameShell mode="surfing" title="THE BREAK" venue="Surf Break" Game={Game} ownControls={babylon} />;
}
