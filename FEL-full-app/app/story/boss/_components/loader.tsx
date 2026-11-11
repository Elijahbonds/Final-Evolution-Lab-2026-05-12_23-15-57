'use client';

import dynamic from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const GlitchBossGame = dynamic(() => import('@/components/games/glitch-boss-game'), {
  ssr: false,
  loading: () => <GameLoading />,
});

export default function BossLoader() {
  return <GameShell mode="storyMode" title="THE VERTIGO" venue="Glitch Arena" Game={GlitchBossGame} />;
}
