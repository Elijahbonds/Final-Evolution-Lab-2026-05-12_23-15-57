'use client';

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import {
  SPEND_REFUSED, SPEND_UNREACHABLE, newSpendNonce, ownedReadFromResponse, skuForSpend, spendResultFromStatus,
  type ReadOwnedKits, type ShardSpend,
} from '@/lib/babylon/music/purchases';

const spinner = () => (
  <div className="flex h-[80vh] items-center justify-center bg-[#050505]">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const StudioMode = dynamic(() => import('@/lib/babylon/music/StudioMode'), { ssr: false, loading: spinner });

export function MusicLoader() {
  // THE SHARDS SEAM, CLOSED (2026-09-20). StudioMode has always taken a `spendShards` prop and fallen back to
  // ALLOWING the spend when it is missing — logging "SHARDS SEAM not wired — allowing ... for free" as it did
  // so. Nothing ever passed it, so both kits and every Cell assist have been free since the day the room
  // shipped. This is the prop.
  //
  // The cost argument is ignored on purpose: the server prices the SKU from the catalogue, and a cost arriving
  // from the client is a suggestion, not a price. The SKU comes from the reason alone (purchases.ts skuForSpend).
  //
  // MUSIC-SUITE P2 (2026-09-25): A TYPED ANSWER, NOT A BOOLEAN. This returned `res.ok`, and the room read every `false`
  // as 'Not enough Shards' — an expired sign-in (401) and a server fault (500) included. Now the status is read
  // (spendResultFromStatus): 401 signed out, 402/409 insufficient, 5xx or no answer at all unreachable ("nothing was
  // charged": the route's 5xx comes from a rolled-back transaction), anything else refused. A consumable's nonce is the
  // ROOM's now (one per confirm), so a second BUY after a lost answer is the same purchase to the server, not another.
  const spendShards = useCallback<ShardSpend>(async (_cost, reason, opts) => {
    const sku = skuForSpend(reason);
    if (!sku) return SPEND_REFUSED; // an unrecognised spend is refused, never waved through

    let res: Response;
    try {
      res = await fetch('/api/music/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // A kit ignores the nonce (its key is permanent); an assist is consumable and each deliberate buy needs its own.
        body: JSON.stringify({ sku, nonce: opts?.nonce ?? newSpendNonce() }),
      });
    } catch {
      return SPEND_UNREACHABLE;
    }
    return spendResultFromStatus(res.status, await res.json().catch(() => null));
  }, []);

  // MUSIC-SUITE P2 (2026-09-25): OWNED KITS COME FROM THE ACCOUNT. GET /api/music/unlock had no caller; kits lived in
  // this device's localStorage only, so a kit bought on a phone was on sale again on a laptop. The room reads this at
  // mount and keeps localStorage as a cache: a failed read keeps the cache, a good one replaces it (a refunded kit goes).
  const readOwnedKits = useCallback<ReadOwnedKits>(async () => {
    try {
      const res = await fetch('/api/music/unlock', { cache: 'no-store' });
      return ownedReadFromResponse(res.status, await res.json().catch(() => null));
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
  }, []);

  // ARENA SETS ONLY (owner, 2026-09-24: "Cap only Arena sets — staked Arena sets end after 32 bars; free play stays
  // endless"). A duel launches the Academy with ?arena=<matchId>, the same query GameShell submits the score under, so
  // the run the shell stakes is exactly the run whose PERFORM set has an end. Without it the set runs until END SET.
  const arenaSet = Boolean(useSearchParams().get('arena'));

  // MUSIC IS BOTH (owner, 2026-09-16). The Academy mounts through GameShell like every
  // other mode; the STAGE pick on its boot splash decides which half you get. STUDIO
  // reports nothing — a tool has no run to post — and PERFORM ends on a card through
  // the shell's normal recap. `ownControls` because the studio draws its own deck.
  return (
    <GameShell
      mode="music"
      title="FEL GROOVE ACADEMY"
      venue="The Academy"
      Game={StudioMode}
      ownControls
      gameProps={{ spendShards, readOwnedKits, arenaSet }}
    />
  );
}
