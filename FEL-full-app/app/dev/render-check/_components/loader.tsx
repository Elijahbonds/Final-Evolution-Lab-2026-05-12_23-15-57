'use client';

import dynamicImport from 'next/dynamic';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading className="h-screen bg-black" label="Loading render check…" />
);

// Babylon touches window/document at module scope — must never be server-rendered.
const RenderCheck = dynamicImport(() => import('@/components/dev/render-check'), { ssr: false, loading: spinner });

export function RenderCheckLoader() {
  return <RenderCheck />;
}
