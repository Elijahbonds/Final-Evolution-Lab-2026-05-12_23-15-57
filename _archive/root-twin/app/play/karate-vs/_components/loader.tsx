'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { isBabylon } from '@/components/three/flags';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const KarateVs2D = dynamicImport(() => import('@/components/games/karate-versus-game'), { ssr: false, loading: spinner });
const KarateVsBabylon = dynamicImport(() => import('@/components/games/karate-vs-babylon'), { ssr: false, loading: spinner });

export function KarateVsLoader() {
  const Game = isBabylon('karateVersus') ? KarateVsBabylon : KarateVs2D;
  return <GameShell mode="karateVersus" title="KARATE VS" venue="Shimogamo Dojo" Game={Game} />;
}
