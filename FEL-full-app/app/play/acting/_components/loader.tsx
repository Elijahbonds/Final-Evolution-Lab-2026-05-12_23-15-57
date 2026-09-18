'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[80vh] items-center justify-center bg-[#050505]">
    <Loader2 className="h-8 w-8 animate-spin text-[#FF3366]" />
  </div>
);

const ActingGame = dynamic(() => import('@/components/games/acting-game'), { ssr: false, loading: spinner });

export function ActingLoader() {
  return <GameShell mode="acting" title="THE READ" venue="Acting Stage" Game={ActingGame} />;
}
