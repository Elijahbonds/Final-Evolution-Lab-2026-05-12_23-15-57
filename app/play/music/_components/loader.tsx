'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const StudioMode = dynamicImport(() => import('@/lib/babylon/music/StudioMode'), { ssr: false, loading: spinner });

export function MusicLoader() {
  // BUILD is a free-running creation tool; a PERFORM set ends via END SET and
  // reports through GameShell so studio play earns the same progression.
  return <GameShell mode="music" title="THE STUDIO" venue="Okta Sound Lab" Game={StudioMode} />;
}
