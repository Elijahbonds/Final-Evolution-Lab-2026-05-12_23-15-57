'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#FF2D95]" />
  </div>
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
  return <GameShell mode="dance" title="THE CYPHER" venue="The Cypher" Game={Game} />;
}
