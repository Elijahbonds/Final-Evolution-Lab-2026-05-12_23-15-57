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

const Gymnastics2D = dynamicImport(() => import('@/components/games/gymnastics-game'), {
  ssr: false, loading: spinner,
});

// Babylon vault on the shared AirSessionCore (lib/babylon/modes/AirSessionMode).
const GymnasticsBabylon = dynamicImport(
  () => import('@/components/games/air-session-babylon').then((m) => ({
    default: m.makeAirHost('gymnastics', 'GYMNASTICS VAULT'),
  })),
  { ssr: false, loading: spinner },
);

export function GymnasticsLoader() {
  const babylon = isBabylon('gymnastics');
  const Game = babylon ? GymnasticsBabylon : Gymnastics2D;
  return (
    <GameShell mode="gymnastics" title="GYMNASTICS" venue="Evolution Arena" Game={Game} ownControls={babylon} />
  );
}
