'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { isBabylon } from '@/components/three/flags';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const TennisGame2D = dynamicImport(() => import('@/components/games/tennis-game'), { ssr: false, loading: spinner });

// M74: TennisMode is now a net-sport (RallyCore + NexusVenue) — same registry key.
const TennisBabylon = dynamicImport(
  () => import('@/components/games/timing-babylon').then((m) => ({
    default: m.makeTimingHost({ modeKey: 'tennis', tag: 'FEL-TENNIS', swingLabel: 'SWING', hint: 'Aim with stick · A to swing as the ball arrives' }),
  })),
  { ssr: false, loading: spinner },
);

export function TennisLoader() {
  const Game = isBabylon('tennis') ? TennisBabylon : TennisGame2D;
  return <GameShell mode="tennis" title="MATCH PLAY" venue="Nexus Tennis Court" Game={Game} />;
}
