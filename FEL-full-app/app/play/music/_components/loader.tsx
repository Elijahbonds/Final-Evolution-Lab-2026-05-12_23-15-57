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
  return <GameShell mode="musicAcademy" title="GROOVE ACADEMY" venue="Studio" Game={StudioMode} />;
}
