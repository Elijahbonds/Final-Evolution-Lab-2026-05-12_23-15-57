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

const Football3D = dynamicImport(() => import('@/components/games/football-3d'), { ssr: false, loading: spinner });
// Babylon.js street football stage (M22–M27 rollout wave 1).
const FootballBabylon = dynamicImport(() => import('@/components/games/football-babylon'), { ssr: false, loading: spinner });

export function FootballLoader() {
  // Street Football is a 3D-only surface (synth on the Court/free-3D archetype);
  // there is no 2D fallback — Babylon when enabled, else the three.js 3D scene.
  const Game = isBabylon('football') ? FootballBabylon : Football3D;
  return <GameShell mode="football" title="STREET FOOTBALL" venue="The Gridiron" Game={Game} />;
}
