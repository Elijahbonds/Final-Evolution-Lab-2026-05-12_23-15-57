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

// BASEBALL-3INN (2026-10-22): the home-run derby's own route — the same timing host, mode and title that /play/baseball
// served until baseball became its own three-inning mode there.
// DERBY-KEY (owner, 2026-10-23): the derby saves its sessions under its own key, 'derby', with its own score rules, stake
// ceiling and arena baseline (each copied from the values it had under 'baseball'), so the three-inning game keeps
// 'baseball' to itself. Sessions saved before this change stay under 'baseball'; nothing was migrated.
// The renderer flag is still the route flag 'baseball', which flips both ballpark routes (components/three/flags.ts).
const DerbyBabylon = dynamicImport(
  () => import('@/components/games/timing-babylon').then((m) => ({
    default: m.makeTimingHost({ modeKey: 'derby', tag: 'FEL-DERBY', swingLabel: 'STRIKE', hint: 'Move the PCI onto the pitch with the stick · STRIKE as it crosses the plate' }),
  })),
  { ssr: false, loading: spinner },
);

export function DerbyLoader() {
  const babylon = isBabylon('baseball');
  const Game = babylon ? DerbyBabylon : is3D('baseball') ? Baseball3D : BaseballGame2D;
  return <GameShell mode="derby" title="MOONSHOT DERBY" venue="Catalina Ballpark" Game={Game} ownControls={babylon} />;
}
