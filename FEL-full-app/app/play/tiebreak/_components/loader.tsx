'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const TiebreakGame = dynamicImport(() => import('@/components/games/tiebreak-game'), {
  ssr: false,
  loading: () => (
    <GameLoading />
  ),
});

export function TiebreakLoader() {
  return <GameShell mode="tiebreak" title="TIEBREAK BLITZ" venue="Venice Tennis Court" Game={TiebreakGame} ownControls />;
}
