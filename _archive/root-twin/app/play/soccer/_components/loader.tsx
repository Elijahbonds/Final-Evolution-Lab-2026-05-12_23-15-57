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

const SoccerGame = dynamicImport(() => import('@/components/games/soccer-game'), { ssr: false, loading: spinner });
const Soccer3D = dynamicImport(() => import('@/components/games/soccer-3d'), { ssr: false, loading: spinner });

// Registry maps the penalty shootout to the 'penalty' timing mode.
const SoccerBabylon = dynamicImport(
  () => import('@/components/games/timing-babylon').then((m) => ({
    default: m.makeTimingHost({ modeKey: 'penalty', tag: 'FEL-PENALTY', swingLabel: 'KICK', hint: 'Aim with stick · A to strike the penalty' }),
  })),
  { ssr: false, loading: spinner },
);

export function SoccerLoader() {
  const Game = isBabylon('soccer') ? SoccerBabylon : is3D('soccer') ? Soccer3D : SoccerGame;
  return <GameShell mode="soccer" title="PENALTY SHOOTOUT" venue="Coastal FC Stadium" Game={Game} />;
}
