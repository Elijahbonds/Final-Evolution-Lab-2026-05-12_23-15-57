'use client';

import dynamicImport from 'next/dynamic';
import { GameLoading } from '@/components/games/game-loading';

// WebRTC, the Gamepad API and Babylon are browser-only: never server-render the room.
const PartyRoomScreen = dynamicImport(() => import('@/components/party/party-room'), {
  ssr: false,
  loading: () => (
    <GameLoading className="fixed inset-0 bg-[#05070c]" label="Loading the party room…" />
  ),
});

export function PartyLoader({ initialMode }: { initialMode: string | null }) {
  return <PartyRoomScreen initialMode={initialMode} />;
}
