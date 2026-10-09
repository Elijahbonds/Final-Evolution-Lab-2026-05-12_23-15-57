'use client';

import dynamicImport from 'next/dynamic';

// The Babylon stage is client-only (WebGL); the page stays a server component (its metadata and the session read).
const Stage = dynamicImport(() => import('./stage').then((m) => ({ default: m.AdventureStoryStage })), { ssr: false });

export function AdventureLoader({ signedIn }: { signedIn: boolean }) {
  return <Stage signedIn={signedIn} />;
}
