'use client';

import { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { isBabylon } from '@/components/three/flags';
import { looksFor, readPlaceLook } from '@/lib/babylon/nexus/placeLooks';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const Sprint2D = dynamicImport(() => import('@/components/games/sprint-game'), {
  ssr: false, loading: spinner,
});

// Babylon 100m on the shared SprintCore (lib/babylon/modes/SprintMode.ts).
const SprintBabylon = dynamicImport(
  () => import('@/components/games/sprint-babylon').then((m) => ({
    default: m.makeSprintHost('sprint', 'BEACH SPRINT'),
  })),
  { ssr: false, loading: spinner },
);

export function SprintLoader() {
  const babylon = isBabylon('sprint');
  const Game = babylon ? SprintBabylon : Sprint2D;
  // QA P1-19 (2026-09-27): the subtitle said Muscle Beach Gym over a running track. It names the place that loads now
  // (Stadium Straight, Beach Dash or Night Meet — the splash's pick), read after mount so the server render agrees.
  const [venue, setVenue] = useState(() => looksFor('sprint')[0]?.name ?? 'Stadium Straight');
  useEffect(() => { const p = readPlaceLook('sprint'); if (p) setVenue(p.name); }, []);
  return <GameShell mode="sprint" title="BEACH SPRINT" venue={venue} Game={Game} ownControls={babylon} />;
}
