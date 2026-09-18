'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const WhoSceneItGame = dynamicImport(() => import('@/components/games/who-scene-it-game'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
    </div>
  ),
});

export function WhoSceneItLoader() {
  return <GameShell mode="whoSceneIt" title="WHO SCENE IT" venue="NeuroArena" Game={WhoSceneItGame} />;
}
