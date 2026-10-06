'use client';

import dynamicImport from 'next/dynamic';

// The Babylon stage is client-only (WebGL); the page itself stays a server component so its 404 gate runs on the server.
const Stage = dynamicImport(() => import('./stage').then((m) => ({ default: m.AdventureStage })), { ssr: false });

export function DevAdventureLoader() {
  return <Stage />;
}
