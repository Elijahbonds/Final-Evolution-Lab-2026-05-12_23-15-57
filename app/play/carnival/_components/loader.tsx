'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

// Court Carnival is a NEW Babylon-only hub mode (M49) — no 2D/legacy fallback
// exists, so the loader boots the Babylon host directly.
const CarnivalBabylon = dynamicImport(() => import('@/components/games/carnival-babylon'), {
  ssr: false,
  loading: spinner,
});

export function CarnivalLoader() {
  return <GameShell mode="carnival" title="COURT CARNIVAL" venue="Venice Beach Carnival" Game={CarnivalBabylon} />;
}
