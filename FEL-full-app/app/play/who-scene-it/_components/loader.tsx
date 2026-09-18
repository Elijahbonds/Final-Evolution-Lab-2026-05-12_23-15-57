'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { isBabylon } from '@/components/three/flags';

const WhoSceneItGame = dynamicImport(() => import('@/components/games/who-scene-it-game'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
    </div>
  ),
});

const WhoSceneItBabylon = dynamicImport(() => import('@/components/games/who-scene-it-babylon'), { ssr: false, loading: () => (
  <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" /></div>
) });

export function WhoSceneItLoader() {
  // lane 3 W1: the live venue quiz on Babylon; the 2D deck stays as the fallback behind the flag
  const babylon = isBabylon('whoSceneIt');
  return <GameShell mode="whoSceneIt" title="WHO SCENE IT" venue={babylon ? 'Scene Vault' : 'NeuroArena'} Game={babylon ? WhoSceneItBabylon : WhoSceneItGame} ownControls={babylon} />;
}
