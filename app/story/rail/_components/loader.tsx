'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const RailGrindGame = dynamic(() => import('@/components/games/rail-grind-game'), {
  ssr: false,
  loading: () => <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" /></div>,
});

export default function RailLoader() {
  return <GameShell mode="storyMode" title="NEXUS RAIL" venue="The Nexus" Game={RailGrindGame} />;
}
