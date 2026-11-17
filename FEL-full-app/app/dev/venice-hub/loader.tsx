'use client';

import dynamicImport from 'next/dynamic';

// Babylon touches window/document at module scope: never server-rendered.
const Stage = dynamicImport(() => import('./stage').then((m) => m.VeniceHubStage), { ssr: false, loading: () => <div className="h-screen bg-black" /> });

export function VeniceHubLoader() {
  return <Stage />;
}
