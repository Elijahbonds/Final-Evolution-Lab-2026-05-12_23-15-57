'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const spinner = () => (
  <div className="flex h-[80vh] items-center justify-center bg-[#050505]">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const MarketplaceHub = dynamic(() => import('@/lib/babylon/marketplace/MarketplaceHub'), { ssr: false, loading: spinner });

export function MarketLoader() {
  return (
    <div className="min-h-screen bg-[#050505]">
      <MarketplaceHub />
    </div>
  );
}
