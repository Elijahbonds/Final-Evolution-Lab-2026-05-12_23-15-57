'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const DuelBabylon = dynamicImport(() => import('@/components/games/duel-babylon'), { ssr: false, loading: spinner });

export function DuelLoader() {
  return <GameShell mode="duel" title="DUEL" venue="Shimogamo Dojo" Game={DuelBabylon} ownControls />;
}
