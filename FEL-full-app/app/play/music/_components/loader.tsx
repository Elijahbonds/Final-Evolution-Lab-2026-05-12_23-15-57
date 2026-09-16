'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[80vh] items-center justify-center bg-[#050505]">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const StudioMode = dynamic(() => import('@/lib/babylon/music/StudioMode'), { ssr: false, loading: spinner });

export function MusicLoader() {
  // MUSIC IS BOTH (owner, 2026-09-16). The Academy mounts through GameShell like every
  // other mode; the STAGE pick on its boot splash decides which half you get. STUDIO
  // reports nothing — a tool has no run to post — and PERFORM ends on a card through
  // the shell's normal recap. `ownControls` because the studio draws its own deck.
  return <GameShell mode="music" title="FEL GROOVE ACADEMY" venue="The Academy" Game={StudioMode} ownControls />;
}
