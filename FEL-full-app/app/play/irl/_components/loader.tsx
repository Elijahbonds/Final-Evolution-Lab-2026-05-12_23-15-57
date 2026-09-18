'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[80vh] items-center justify-center bg-[#050505]">
    <Loader2 className="h-8 w-8 animate-spin text-[#00FF9D]" />
  </div>
);

const IrlGame = dynamic(() => import('@/components/games/irl-game'), { ssr: false, loading: spinner });

export function IrlLoader() {
  // See the acting loader: this was bare too. IRL is device-motion driven, so it
  // keeps its own controls.
  return <GameShell mode="irl" title="VERT" venue="Anywhere" Game={IrlGame} ownControls />;
}
