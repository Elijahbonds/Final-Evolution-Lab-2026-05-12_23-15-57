'use client';

import dynamic from 'next/dynamic';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading className="h-[80vh] bg-[#050505]" label="Loading Kitchens…" />
);

const KitchenHub = dynamic(() => import('@/lib/babylon/kitchens/KitchenHub'), { ssr: false, loading: spinner });

export function KitchenLoader() {
  return (
    <div className="min-h-screen bg-[#050505]">
      <KitchenHub />
    </div>
  );
}
