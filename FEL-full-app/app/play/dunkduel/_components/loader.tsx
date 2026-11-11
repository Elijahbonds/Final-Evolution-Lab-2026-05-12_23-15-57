'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

const DunkDuelBabylon = dynamicImport(() => import('@/components/games/dunkduel-babylon'), { ssr: false, loading: spinner });

export function DunkDuelLoader() {
  return <GameShell mode="dunkduel" title="PROVE IT" venue="Venice Beach Court" Game={DunkDuelBabylon} ownControls />;
}
