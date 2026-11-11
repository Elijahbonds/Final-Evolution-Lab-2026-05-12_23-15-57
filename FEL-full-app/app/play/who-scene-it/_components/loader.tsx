'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const WhoSceneItGame = dynamicImport(() => import('@/components/games/who-scene-it-game'), {
  ssr: false,
  loading: () => (
    <GameLoading />
  ),
});

const WhoSceneItBabylon = dynamicImport(() => import('@/components/games/who-scene-it-babylon'), { ssr: false, loading: () => (
  <GameLoading />
) });

export function WhoSceneItLoader() {
  // lane 3 W1: the live venue quiz on Babylon; the 2D deck stays as the fallback behind the flag.
  // The shell names the mode's home room; individual questions still mount the FEL venues being guessed.
  const babylon = isBabylon('whoSceneIt');
  return <GameShell mode="whoSceneIt" title="SPOT THE SCENE" venue="Scene Vault" Game={babylon ? WhoSceneItBabylon : WhoSceneItGame} ownControls={babylon} />;
}
