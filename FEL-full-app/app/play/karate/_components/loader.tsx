'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

const Karate2D = dynamicImport(() => import('@/components/games/karate-game'), { ssr: false, loading: spinner });
const Karate3D = dynamicImport(() => import('@/components/games/karate-3d'), { ssr: false, loading: spinner });
// Babylon.js karate stage (M22–M27 rollout wave 1).
const KarateBabylon = dynamicImport(() => import('@/components/games/karate-babylon'), { ssr: false, loading: spinner });

export function KarateLoader() {
  const babylon = isBabylon('karateEndless');
  const Game = babylon ? KarateBabylon : is3D('karateEndless') ? Karate3D : Karate2D;
  return <GameShell mode="karateEndless" title="THE HUNDRED" venue="Shimogamo Dojo" Game={Game} ownControls={babylon} />;
}
