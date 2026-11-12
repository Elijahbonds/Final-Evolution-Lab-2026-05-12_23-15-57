'use client';

import dynamic from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const RailGrindGame = dynamic(() => import('@/components/games/rail-grind-game'), {
  ssr: false,
  loading: () => <GameLoading />,
});

export default function RailLoader() {
  return <GameShell mode="storyMode" title="NEXUS RAIL" venue="The Nexus" Game={RailGrindGame} />;
}
