'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

const VolleyballBabylon = dynamicImport(
  () => import('@/components/games/timing-babylon').then((m) => ({
    default: m.makeTimingHost({ modeKey: 'volleyball', tag: 'FEL-VOLLEYBALL', swingLabel: 'HIT', hint: 'Aim with stick \u00b7 A to hit as the ball arrives' }),
  })),
  { ssr: false, loading: spinner },
);

export function VolleyballLoader() {
  // M74: volleyball is Babylon-only (no legacy 2D fallback).
  const Game = VolleyballBabylon;
  return <GameShell mode="volleyball" title="BEACH RALLY" venue="Nexus Volleyball Court" Game={Game} ownControls />;
}
