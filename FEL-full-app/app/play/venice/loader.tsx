'use client';

import dynamicImport from 'next/dynamic';
import { GameLoading } from '@/components/games/game-loading';

// The Babylon stage is client-only (WebGL); the page stays a server component (its metadata and the session read).
const Stage = dynamicImport(() => import('./stage').then((m) => ({ default: m.VeniceStage })), { ssr: false, loading: () => <GameLoading className="min-h-[60vh]" /> });

export function VeniceLoader({ signedIn }: { signedIn: boolean }) {
  return <Stage signedIn={signedIn} />;
}
