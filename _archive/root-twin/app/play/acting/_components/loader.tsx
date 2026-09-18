'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const spinner = () => (
  <div className="flex h-[80vh] items-center justify-center bg-[#050505]">
    <Loader2 className="h-8 w-8 animate-spin text-[#FF3366]" />
  </div>
);

const ActingGame = dynamic(() => import('@/components/games/acting-game'), { ssr: false, loading: spinner });

export function ActingLoader() {
  return <ActingGame />;
}
