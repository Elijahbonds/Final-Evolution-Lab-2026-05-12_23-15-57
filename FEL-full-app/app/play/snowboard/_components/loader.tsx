'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const SnowboardGame2D = dynamicImport(() => import('@/components/games/snowboard-game'), {
  ssr: false,
  loading: () => (
    <GameLoading />
  ),
});

const Snowboard3D = dynamicImport(() => import('@/components/games/board-snow-3d'), {
  ssr: false,
  loading: () => (
    <GameLoading />
  ),
});

const SnowboardBabylon = dynamicImport(
  () => import('@/components/games/board-babylon').then((m) => ({
    default: m.makeBoardHost({ modeKey: 'snowboard_slalom', tag: 'FEL-SNOW', title: 'GATE CRASHER', tricks: ['SPIN', 'GRAB', 'FLIP'], hint: 'Carve between the poles · TUCK for speed · JUMP rocks and kickers · catch the LIFT CABLE · dodge the YETI' }),
  })),
  {
    ssr: false,
    loading: () => (
      <GameLoading />
    ),
  },
);

export function SnowboardLoader() {
  const babylon = isBabylon('snowboard_slalom');
  const Game = babylon ? SnowboardBabylon : is3D('snowboarding') ? Snowboard3D : SnowboardGame2D;
  return <GameShell mode="snowboarding" title="GATE CRASHER" venue="Mountain Slope" Game={Game} ownControls={babylon} />;
}
