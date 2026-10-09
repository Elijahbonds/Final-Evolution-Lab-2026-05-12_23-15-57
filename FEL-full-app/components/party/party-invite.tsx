'use client';
// "PLAY WITH FRIENDS" on a game's start screen and its results card (MULTIPLAYER lane, 2026-10-06): the game's own
// door into the party room, with the game already picked. Shown only for a game that really seats more than one
// person (lib/party/catalog.ts), only to a signed-in player (the room is a /play page), and never inside the room.

import { useContext } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SessionContext } from 'next-auth/react';
import { Users } from 'lucide-react';
import { partyHref, partyModeFor, playersBadge, styleLine } from '@/lib/party/catalog';

export function PartyInvite({ modeId, variant = 'chip' }: { modeId: string; variant?: 'chip' | 'card' }) {
  const pathname = usePathname() || '';
  // read the context, not useSession(): a splash rendered with no SessionProvider (a test, a bare harness) is a guest
  const status = useContext(SessionContext)?.status;
  const m = partyModeFor(modeId);
  if (!m || status !== 'authenticated' || pathname.startsWith('/play/party')) return null;
  if (variant === 'card') {
    return (
      <Link href={partyHref(m.id)} data-testid="party-invite-card"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[#00E5FF]/50 bg-[#00E5FF]/10 py-2.5 text-sm font-bold text-[#00E5FF] hover:bg-[#00E5FF]/20">
        <Users className="h-4 w-4" /> PLAY THIS WITH FRIENDS · {playersBadge(m)}
      </Link>
    );
  }
  return (
    <Link href={partyHref(m.id)} data-testid="party-invite-chip"
      className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/40 px-3 py-1 text-[10px] font-black tracking-[0.2em] text-white/85 hover:border-white/60">
      <Users className="h-3.5 w-3.5" /> PLAY WITH FRIENDS · {playersBadge(m)} · {styleLine(m)}
    </Link>
  );
}
