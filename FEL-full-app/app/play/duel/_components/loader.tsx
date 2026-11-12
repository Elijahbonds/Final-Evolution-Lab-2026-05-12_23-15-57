'use client';

import { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { duelVenueName } from '@/lib/babylon/combat/arenas';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading />
);

const DuelBabylon = dynamicImport(() => import('@/components/games/duel-babylon'), { ssr: false, loading: spinner });

export function DuelLoader() {
  // QA P1-16 (2026-09-27): the subtitle said Shimogamo Dojo over a rooftop. It names the arena that loads now — the
  // splash's pick (?arena=, then the remembered one), read after mount so the server render and the first paint agree.
  const [venue, setVenue] = useState(() => duelVenueName(null));
  useEffect(() => { setVenue(duelVenueName()); }, []);
  return <GameShell mode="duel" title="DUEL" venue={venue} Game={DuelBabylon} ownControls />;
}
