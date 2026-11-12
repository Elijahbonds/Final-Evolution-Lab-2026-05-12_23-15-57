'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

// FreeRun (A+ mission #10) — Babylon only: a Havok character controller on an authored course, Skate's combo scoring.
const FreeRunBabylon = dynamicImport(() => import('@/components/games/freerun-babylon'), { ssr: false, loading: spinner });

export function FreeRunLoader() {
  return <GameShell mode="freerun" title="FREE RUN" venue="The Yard" Game={FreeRunBabylon} ownControls />;
}
