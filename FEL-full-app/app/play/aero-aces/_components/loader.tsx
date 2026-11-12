'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

// The GameShell `mode` MUST be "aeroAces": that is the session mode MP_SESSION_MODE maps this challenge to,
// and a challenge whose session mode nobody posts can never settle (lib/mp/match-core.ts records exactly
// that bug happening to twelve of fourteen keys once already).
const Game = dynamicImport(() => import('@/components/games/aero-aces-babylon'), { ssr: false, loading: spinner });

export function AeroAcesLoader() {
  return <GameShell mode="aeroAces" title="AERO ACES" venue="Gate Run" Game={Game} ownControls />;
}
