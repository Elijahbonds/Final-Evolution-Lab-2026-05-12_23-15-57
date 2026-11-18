'use client';

import dynamic from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading className="h-[80vh] bg-[#050505]" label="Loading VERT…" />
);

const IrlGame = dynamic(() => import('@/components/games/irl-game'), { ssr: false, loading: spinner });

export function IrlLoader() {
  // See the acting loader: this was bare too. IRL is device-motion driven, so it
  // keeps its own controls.
  return <GameShell mode="irl" title="VERT" venue="Anywhere" Game={IrlGame} ownControls />;
}
