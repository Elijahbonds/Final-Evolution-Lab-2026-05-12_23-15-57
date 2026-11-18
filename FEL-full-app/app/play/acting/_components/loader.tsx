'use client';

import dynamic from 'next/dynamic';
import { GameShell } from '@/components/games/game-shell';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading className="h-[80vh] bg-[#050505]" label="Loading The Read…" />
);

const ActingGame = dynamic(() => import('@/components/games/acting-game'), { ssr: false, loading: spinner });

export function ActingLoader() {
  // Acting was mounting bare: no gamepad poller, no touch deck, no session post
  // and no recap, so a scored performance paid nothing. `ownControls` because
  // the surface draws its own mic/delivery UI.
  return <GameShell mode="acting" title="THE READ" venue="Soundstage" Game={ActingGame} ownControls />;
}
