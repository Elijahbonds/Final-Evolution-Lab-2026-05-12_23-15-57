'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';

const SkateboardGame2D = dynamicImport(() => import('@/components/games/skateboard-game'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
    </div>
  ),
});

const Skateboard3D = dynamicImport(() => import('@/components/games/board-skate-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
    </div>
  ),
});

const SkateboardBabylon = dynamicImport(
  () => import('@/components/games/board-babylon').then((m) => ({
    default: m.makeBoardHost({ modeKey: 'skateboard', tag: 'FEL-SKATE', tricks: ['KICKFLIP', 'HEELFLIP', 'GRAB'], hint: 'Steer · hold PUMP · JUMP to ollie/grind · tricks in air' }),
  })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
      </div>
    ),
  },
);

export function SkateboardLoader() {
  const Game = isBabylon('skateboard') ? SkateboardBabylon : is3D('skateboard') ? Skateboard3D : SkateboardGame2D;
  return <GameShell mode="skateboarding" title="SKATE RUN" venue="Venice Skatepark" Game={Game} />;
}
