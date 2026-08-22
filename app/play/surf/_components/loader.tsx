'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';

const SurfGame2D = dynamicImport(() => import('@/components/games/surf-game'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
    </div>
  ),
});

const Surf3D = dynamicImport(() => import('@/components/games/board-surf-3d'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
    </div>
  ),
});

const SurfBabylon = dynamicImport(
  () => import('@/components/games/board-babylon').then((m) => ({
    default: m.makeBoardHost({ modeKey: 'surf', tag: 'FEL-SURF', tricks: ['CUTBACK', 'AIR', 'GRAB'], hint: 'Steer the pocket · hold PUMP · JUMP for air · tricks off the lip' }),
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

export function SurfLoader() {
  const Game = isBabylon('surf') ? SurfBabylon : is3D('surfing') ? Surf3D : SurfGame2D;
  return <GameShell mode="surfing" title="SURF BREAK" venue="Surf Break" Game={Game} />;
}
