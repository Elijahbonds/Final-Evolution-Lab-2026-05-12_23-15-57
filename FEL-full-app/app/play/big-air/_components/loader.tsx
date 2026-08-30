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

const BigAir3D = dynamicImport(() => import('@/components/games/big-air-game'), {
  ssr: false, loading: spinner,
});

// Babylon big air on the same shared AirSessionCore as the gymnastics vault.
const BigAirBabylon = dynamicImport(
  () => import('@/components/games/air-session-babylon').then((m) => ({
    default: m.makeAirHost('bigair', 'BIG AIR'),
  })),
  { ssr: false, loading: spinner },
);

export function BigAirLoader() {
  const babylon = isBabylon('bigAir');
  const Game = babylon ? BigAirBabylon : BigAir3D;
  return <GameShell mode="bigAir" title="BIG AIR" venue="Alpine Ridge" Game={Game} ownControls={babylon} />;
}
