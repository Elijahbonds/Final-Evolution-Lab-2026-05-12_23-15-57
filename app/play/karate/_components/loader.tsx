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

const Karate2D = dynamicImport(() => import('@/components/games/karate-game'), { ssr: false, loading: spinner });
const Karate3D = dynamicImport(() => import('@/components/games/karate-3d'), { ssr: false, loading: spinner });
// Babylon.js karate stage (M22–M27 rollout wave 1).
const KarateBabylon = dynamicImport(() => import('@/components/games/karate-babylon'), { ssr: false, loading: spinner });

export function KarateLoader() {
  const Game = isBabylon('karateEndless') ? KarateBabylon : is3D('karateEndless') ? Karate3D : Karate2D;
  return <GameShell mode="karateEndless" title="KARATE ENDLESS" venue="Shimogamo Dojo" Game={Game} />;
}
