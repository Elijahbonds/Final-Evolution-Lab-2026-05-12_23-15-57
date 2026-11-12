'use client';

import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

// The GameShell `mode` MUST be "velocityKart": that is the session mode MP_SESSION_MODE maps this challenge to,
// and a challenge whose session mode nobody posts can never settle (lib/mp/match-core.ts records exactly
// that bug happening to twelve of fourteen keys once already).
const Game = dynamicImport(() => import('@/components/games/velocity-kart-babylon'), { ssr: false, loading: spinner });

export function VelocityKartLoader() {
  return <GameShell mode="velocityKart" title="VELOCITY KART" venue="Sovereign Circuit" Game={Game} ownControls />;
}
