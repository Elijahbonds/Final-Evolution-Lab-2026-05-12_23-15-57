'use client';

import dynamicImport from 'next/dynamic';
// EVERY-SCREEN P7: while the stage's code loads, a line that says so (the rig read a blank screen: nothing drawn until it came)
import { GameLoading } from '@/components/games/game-loading';

// The Babylon stage is client-only (WebGL); the page stays a server component.
const Stage = dynamicImport(() => import('./stage').then((m) => ({ default: m.AdventureBRStage })), { ssr: false, loading: () => <GameLoading className="min-h-[60vh]" /> });

export function AdventureBRLoader({ signedIn = false }: { signedIn?: boolean } = {}) {
  return <Stage signedIn={signedIn} />;
}
