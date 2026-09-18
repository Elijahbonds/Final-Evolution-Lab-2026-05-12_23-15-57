'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

// FreeRun (A+ mission #10) — Babylon only: a Havok character controller on an authored course, Skate's combo scoring.
const FreeRunBabylon = dynamicImport(() => import('@/components/games/freerun-babylon'), { ssr: false, loading: spinner });

export function FreeRunLoader() {
  return <GameShell mode="freerun" title="FREE RUN" venue="The Yard" Game={FreeRunBabylon} ownControls />;
}
