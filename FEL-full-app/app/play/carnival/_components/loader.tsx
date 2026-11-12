'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

// Court Carnival is a NEW Babylon-only hub mode (M49) — no 2D/legacy fallback
// exists, so the loader boots the Babylon host directly.
const CarnivalBabylon = dynamicImport(() => import('@/components/games/carnival-babylon'), {
  ssr: false,
  loading: spinner,
});

export function CarnivalLoader() {
  return <GameShell mode="carnival" title="GAME NIGHT" venue="Venice Beach Carnival" Game={CarnivalBabylon} ownControls />;
}
