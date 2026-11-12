'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { useHeldDob, useHeldDobYear } from '@/lib/move/useHeldDobYear';
import { isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

const KarateVs2D = dynamicImport(() => import('@/components/games/karate-versus-game'), { ssr: false, loading: spinner });
const KarateVsBabylon = dynamicImport(() => import('@/components/games/karate-vs-babylon'), { ssr: false, loading: spinner });

export function KarateVsLoader({ dobYear, dob = null }: { dobYear: number | null; dob?: string | null }) {
  useHeldDobYear(dobYear);
  useHeldDob(dob);
  const babylon = isBabylon('karateVersus');
  const Game = babylon ? KarateVsBabylon : KarateVs2D;
  return <GameShell mode="karateVersus" title="STORM DUEL" venue="Shimogamo Dojo" Game={Game} ownControls={babylon} />;
}
