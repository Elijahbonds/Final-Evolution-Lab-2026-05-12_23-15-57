'use client';

import dynamic from 'next/dynamic';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading className="h-[80vh] bg-[#050505]" label="Loading the market…" />
);

const MarketplaceHub = dynamic(() => import('@/lib/babylon/marketplace/MarketplaceHub'), { ssr: false, loading: spinner });

export function MarketLoader() {
  return (
    <div className="min-h-screen bg-[#050505]">
      <MarketplaceHub />
    </div>
  );
}
