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

// BASEBALL-3INN (2026-10-22, PM call per ALL-MODES-TO-75 §6): /play/baseball is three innings of baseball, its own mode
// (BaseballInningsMode, handed to the timing host directly — see that file's header). The home-run derby that used to
// answer here moved to /play/derby, unchanged.
const BaseballBabylon = dynamicImport(
  () => Promise.all([import('@/components/games/timing-babylon'), import('@/lib/babylon/modes/BaseballInningsMode')]).then(([m, b]) => ({
    default: m.makeTimingHost({ modeKey: 'baseball', def: b.BaseballInningsMode, tag: 'FEL-BASEBALL', swingLabel: 'SWING', hint: 'SWING as the pitch crosses the plate' }),
  })),
  { ssr: false, loading: spinner },
);

export function BaseballLoader() {
  const babylon = isBabylon('baseball');
  const Game = babylon ? BaseballBabylon : is3D('baseball') ? Baseball3D : BaseballGame2D;
  return <GameShell mode="baseball" title="BASEBALL" venue="Catalina Ballpark" Game={Game} ownControls={babylon} />;
}
