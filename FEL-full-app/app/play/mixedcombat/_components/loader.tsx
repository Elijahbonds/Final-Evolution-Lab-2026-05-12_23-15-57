'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { useHeldDob, useHeldDobYear } from '@/lib/move/useHeldDobYear';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

const MixedCombatBabylon = dynamicImport(() => import('@/components/games/mixedcombat-babylon'), { ssr: false, loading: spinner });

export function MixedCombatLoader({ dobYear, dob = null }: { dobYear: number | null; dob?: string | null }) {
  useHeldDobYear(dobYear);
  useHeldDob(dob);
  return <GameShell mode="mixedcombat" title="RING'S EDGE" venue="The Octagon" Game={MixedCombatBabylon} ownControls />;
}
