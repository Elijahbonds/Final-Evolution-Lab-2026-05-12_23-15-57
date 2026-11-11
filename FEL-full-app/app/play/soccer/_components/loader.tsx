'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
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
  const babylon = isBabylon('soccer');
  const Game = babylon ? SoccerBabylon : is3D('soccer') ? Soccer3D : SoccerGame;
  return <GameShell mode="soccer" title="TWELVE YARDS" venue="Coastal FC Stadium" Game={Game} ownControls={babylon} />;
}
