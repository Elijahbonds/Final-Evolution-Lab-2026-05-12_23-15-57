'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

const BigAir3D = dynamicImport(() => import('@/components/games/big-air-game'), {
  ssr: false, loading: spinner,
});

// Babylon big air on the same shared AirSessionCore as the gymnastics vault.
const BigAirBabylon = dynamicImport(
  () => import('@/components/games/air-session-babylon').then((m) => ({
    default: m.makeAirHost('bigair', 'STOMP'),
  })),
  { ssr: false, loading: spinner },
);

export function BigAirLoader() {
  const babylon = isBabylon('bigAir');
  const Game = babylon ? BigAirBabylon : BigAir3D;
  return <GameShell mode="bigAir" title="STOMP" venue="Alpine Ridge" Game={Game} ownControls={babylon} />;
}
