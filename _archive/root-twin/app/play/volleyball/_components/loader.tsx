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

const VolleyballBabylon = dynamicImport(
  () => import('@/components/games/timing-babylon').then((m) => ({
    default: m.makeTimingHost({ modeKey: 'volleyball', tag: 'FEL-VOLLEYBALL', swingLabel: 'HIT', hint: 'Aim with stick \u00b7 A to hit as the ball arrives' }),
  })),
  { ssr: false, loading: spinner },
);

export function VolleyballLoader() {
  // M74: volleyball is Babylon-only (no legacy 2D fallback).
  const Game = VolleyballBabylon;
  return <GameShell mode="volleyball" title="BEACH RALLY" venue="Nexus Volleyball Court" Game={Game} />;
}
