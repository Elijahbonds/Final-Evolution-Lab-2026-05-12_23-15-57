'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const MixedCombatBabylon = dynamicImport(() => import('@/components/games/mixedcombat-babylon'), { ssr: false, loading: spinner });

export function MixedCombatLoader() {
  return <GameShell mode="mixedcombat" title="MIXED COMBAT" venue="The Octagon" Game={MixedCombatBabylon} />;
}
