'use client';

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { CELL_ASSIST_SHARDS, CELL_ASSIST_SKU, kitSkuId } from '@/lib/babylon/music/purchases';
import { KIT_META, type KitId } from '@/lib/babylon/music/SynthKit';

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
  // from the client is a suggestion, not a price. It is matched back to a SKU by the amount the room displays,
  // which lib/babylon/music/purchases.ts keeps equal to KIT_META by test.
  const spendShards = useCallback(async (cost: number, reason: string): Promise<boolean> => {
    const kit = (Object.keys(KIT_META) as KitId[]).find((k) => reason === `unlock kit ${k}`);
    const sku = kit ? kitSkuId(kit) : cost === CELL_ASSIST_SHARDS ? CELL_ASSIST_SKU : null;
    if (!sku) return false; // an unrecognised spend is refused, never waved through

    try {
      const res = await fetch('/api/music/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sku,
          // A kit ignores this; an assist is consumable and each deliberate buy needs its own key.
          nonce: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

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
      gameProps={{ spendShards }}
    />
  );
}
