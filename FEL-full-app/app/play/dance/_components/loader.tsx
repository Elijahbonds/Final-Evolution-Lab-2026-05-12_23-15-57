'use client';

import dynamicImport from 'next/dynamic';
import { GameLoading } from '@/components/games/game-loading';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <GameLoading />
);

const DanceBabylon = dynamicImport(
  () => import('@/components/games/timing-babylon').then((m) => ({
    default: m.makeTimingHost({ modeKey: 'dance', tag: 'FEL-DANCE', swingLabel: 'TAP', hint: 'Tap A on the beat \u00b7 nail the count-in first' }),
  })),
  { ssr: false, loading: spinner },
);

export function DanceLoader() {
  // M75: dance is Babylon-only, driven by the shared timing host on the audio clock.
  const Game = DanceBabylon;
  return <GameShell mode="dance" title="THE CYPHER" venue="The Cypher" Game={Game} ownControls />;
}
