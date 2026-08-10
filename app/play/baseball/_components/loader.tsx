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

const BaseballGame2D = dynamicImport(() => import('@/components/games/baseball-game'), { ssr: false, loading: spinner });
const Baseball3D = dynamicImport(() => import('@/components/games/baseball-3d'), { ssr: false, loading: spinner });

// Registry maps the home-run derby to the 'derby' timing mode.
const BaseballBabylon = dynamicImport(
  () => import('@/components/games/timing-babylon').then((m) => ({
    default: m.makeTimingHost({ modeKey: 'derby', tag: 'FEL-DERBY', swingLabel: 'STRIKE', hint: 'Time the swing · stick up/down shapes launch' }),
  })),
  { ssr: false, loading: spinner },
);

export function BaseballLoader() {
  const Game = isBabylon('baseball') ? BaseballBabylon : is3D('baseball') ? Baseball3D : BaseballGame2D;
  return <GameShell mode="baseball" title="HOME RUN DERBY" venue="Catalina Ballpark" Game={Game} />;
}
