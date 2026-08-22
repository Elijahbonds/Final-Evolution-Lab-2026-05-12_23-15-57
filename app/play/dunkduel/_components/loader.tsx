'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const DunkDuelBabylon = dynamicImport(() => import('@/components/games/dunkduel-babylon'), { ssr: false, loading: spinner });

export function DunkDuelLoader() {
  return <GameShell mode="dunkduel" title="DUNK DUEL" venue="Venice Beach Court" Game={DunkDuelBabylon} />;
}
