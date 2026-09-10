'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#FF3366]" />
  </div>
);

const ActingGame = dynamicImport(() => import('@/components/games/acting-game'), { ssr: false, loading: spinner });

export function ActingLoader() {
  // Mounted through GameShell like every other play mode: the shared input
  // contract plus the progression choke point (session -> XP/shards/PRQ/mastery).
  return <GameShell mode="acting" title="THE TAKE" venue="Scene Study Room" Game={ActingGame} />;
}
