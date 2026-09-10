'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00FF9D]" />
  </div>
);

const IrlGame = dynamicImport(() => import('@/components/games/irl-game'), { ssr: false, loading: spinner });

export function IrlLoader() {
  return <GameShell mode="irl" title="HANG TIME" venue="Wherever You Are" Game={IrlGame} />;
}
