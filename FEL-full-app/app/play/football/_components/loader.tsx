'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { is3D, isBabylon } from '@/components/three/flags';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

const Football3D = dynamicImport(() => import('@/components/games/football-3d'), { ssr: false, loading: spinner });
// Babylon.js street football stage (M22–M27 rollout wave 1).
const FootballBabylon = dynamicImport(() => import('@/components/games/football-babylon'), { ssr: false, loading: spinner });

export function FootballLoader() {
  // Street Football is a 3D-only surface (synth on the Court/free-3D archetype);
  // there is no 2D fallback — Babylon when enabled, else the three.js 3D scene.
  const babylon = isBabylon('football');
  const Game = babylon ? FootballBabylon : Football3D;
  return <GameShell mode="football" title="BREAKAWAY" venue="The Gridiron" Game={Game} ownControls={babylon} />;
}
