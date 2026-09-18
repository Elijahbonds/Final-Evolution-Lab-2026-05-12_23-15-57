'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const GolfGame2D = dynamicImport(() => import('@/components/games/golf-game'), { ssr: false, loading: spinner });
const Golf3D = dynamicImport(() => import('@/components/games/golf-3d'), { ssr: false, loading: spinner });

const GolfBabylon = dynamicImport(
  () => import('@/components/games/timing-babylon').then((m) => ({
    default: m.makeTimingHost({ modeKey: 'golf', tag: 'FEL-GOLF', swingLabel: 'SWING', hint: 'Aim with stick · A at address to pure the strike' }),
  })),
  { ssr: false, loading: spinner },
);

export function GolfLoader() {
  const Game = isBabylon('golf') ? GolfBabylon : is3D('golf') ? Golf3D : GolfGame2D;
  return <GameShell mode="golf" title="LINKS CHALLENGE" venue="Coastal Links" Game={Game} />;
}
