'use client';

import dynamicImport from 'next/dynamic';
// EVERY-SCREEN P7: while the stage's code loads, a line that says so (the rig read a blank screen: nothing drawn until it came)
import { GameLoading } from '@/components/games/game-loading';

// The Babylon stage is client-only (WebGL); the page stays a server component (its metadata and the session read).
const Stage = dynamicImport(() => import('./stage').then((m) => ({ default: m.AdventureStoryStage })), { ssr: false, loading: () => <GameLoading className="min-h-[60vh]" /> });

export function AdventureLoader({ signedIn }: { signedIn: boolean }) {
  return <Stage signedIn={signedIn} />;
}
