'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// WebRTC, the Gamepad API and Babylon are browser-only: never server-render the room.
const PartyRoomScreen = dynamicImport(() => import('@/components/party/party-room'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 grid place-items-center bg-[#05070c]"><Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" /></div>
  ),
});

export function PartyLoader({ initialMode }: { initialMode: string | null }) {
  return <PartyRoomScreen initialMode={initialMode} />;
}
