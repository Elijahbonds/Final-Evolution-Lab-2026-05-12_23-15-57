'use client';

import dynamicImport from 'next/dynamic';
import { GameLoading } from '@/components/games/game-loading';

const spinner = () => (
  <GameLoading className="min-h-[100dvh] bg-[#07090d]" label="Loading controller…" />
);

// WebRTC + DeviceOrientation are browser-only; never server-render this.
const ControllerPage = dynamicImport(() => import('@/components/controller-link/controller-page'), {
  ssr: false, loading: spinner,
});

export function ControllerLoader({ code }: { code: string }) {
  return <ControllerPage code={code} />;
}
