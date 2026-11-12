'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { useHeldDob, useHeldDobYear } from '@/lib/move/useHeldDobYear';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

// Babylon-only (no 2D fallback exists for this mode).
const ShowdownBabylon = dynamicImport(() => import('@/components/games/showdown-babylon'), {
  ssr: false, loading: spinner,
});

export function ShowdownLoader({ dobYear, dob = null }: { dobYear: number | null; dob?: string | null }) {
  useHeldDobYear(dobYear);
  useHeldDob(dob);
  return <GameShell mode="showdown" title="SHOWDOWN" venue="Shimogamo Dojo" Game={ShowdownBabylon} ownControls />;
}
