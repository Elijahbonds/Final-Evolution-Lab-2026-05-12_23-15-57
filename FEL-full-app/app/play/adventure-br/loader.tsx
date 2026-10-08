'use client';

import dynamicImport from 'next/dynamic';

// The Babylon stage is client-only (WebGL); the page stays a server component.
const Stage = dynamicImport(() => import('./stage').then((m) => ({ default: m.AdventureBRStage })), { ssr: false });

export function AdventureBRLoader() {
  return <Stage />;
}
