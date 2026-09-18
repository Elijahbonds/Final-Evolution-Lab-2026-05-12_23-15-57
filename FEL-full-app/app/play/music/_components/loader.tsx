'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const spinner = () => (
  <div className="flex h-[80vh] items-center justify-center bg-[#050505]">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const StudioMode = dynamic(() => import('@/lib/babylon/music/StudioMode'), { ssr: false, loading: spinner });

export function MusicLoader() {
  return (
    <div className="min-h-screen bg-[#050505]">
      <StudioMode />
    </div>
  );
}
