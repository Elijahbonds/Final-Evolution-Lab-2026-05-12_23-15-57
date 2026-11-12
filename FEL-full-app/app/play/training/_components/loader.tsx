'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const TrainingGame = dynamicImport(() => import('@/components/games/training-game'), {
  ssr: false,
  loading: () => (
    <GameLoading />
  ),
});

export function TrainingLoader() {
  return <GameShell mode="training" title="IRON PARADISE" venue="Muscle Beach Gym" Game={TrainingGame} />;
}
