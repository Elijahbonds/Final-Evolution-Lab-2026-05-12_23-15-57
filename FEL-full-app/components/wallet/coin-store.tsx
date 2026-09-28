'use client';

/**
 * components/wallet/coin-store.tsx — Coin store + spend catalog (monetization).
 *
 * Two sections:
 *   1. Coin packs  — real-money purchase via Stripe Checkout (coins ONLY).
 *   2. Spend Your Balance — where coins and shards are spent: the page that
 *      sells each thing and delivers it (HOTFIX 2026-09-24, see WHERE_TO_SPEND).
 *
 * All prices are SERVER-OWNED; the client only sends a pack id. Balances are
 * always the authoritative server values.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Coins, Gem, Loader2, ShoppingCart, Sparkles, History, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { COIN_STORE_PACKS, coinStorePackTotal } from '@/lib/wallet/catalog';
import { shardSaleCopy } from '@/lib/wallet/purchases';
import { usePurchasesEnabled } from '@/lib/wallet/use-purchases-enabled';

interface Balances { coins: number; shards: number }

// HOTFIX (2026-09-24): "Spend Your Balance" used to list every SKU in CATALOG with a Buy button on the generic spend,
// 30 of them, most shown as a raw id ("private_1on1 900 Buy"). 24 took the coins or shards and delivered nothing,
// because each is delivered by its own page and route (SPEND_ROUTE_SKUS in lib/wallet/catalog.ts has the list). The
// owner's economy-honesty call: refuse dead-end buys. So /store sells coin packs and points at the pages whose buy is
// the real one. Every href here is a page in app/ (components/wallet/storefronts.test.tsx checks it).
// MIRROR-COACH P1 (2026-09-25): Workout ("Personalized training plans") left this list when its plans went NOT_ON_SALE
// (owner decision #3, lib/workout/plan-sale.ts). It was never personal either: every buyer got the same plan.
export const WHERE_TO_SPEND: { href: string; place: string; what: string; currency: 'coins' | 'shards' }[] = [
  { href: '/closet', place: 'Closet', what: 'Wearables for your athlete', currency: 'coins' },
  { href: '/profile', place: 'Profile', what: 'Creator boost cards', currency: 'shards' },
  { href: '/sessions', place: 'Sessions', what: 'Group workouts and private 1-on-1s', currency: 'shards' },
  { href: '/play/music', place: 'Music Room', what: 'Sound kits and the Cell foundation', currency: 'shards' },
];

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CoinStore() {
  const [balances, setBalances] = useState<Balances>({ coins: 0, shards: 0 });
  // FEATURES-UX-SHOP (2026-09-08): ONE purchases truth (lib/wallet/purchases.ts) — this store said "shard packs are sold
  // separately" while /shop/shards showed COMING SOON with every Buy disabled. Both now read the same flag and the same copy.
  const purchasesEnabled = usePurchasesEnabled();
  const copy = shardSaleCopy(purchasesEnabled);
  const [busy, setBusy] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    try {
      const w = await fetch('/api/v1/wallet', { cache: 'no-store' });
      if (w.ok) {
        const d = await w.json();
        setBalances({ coins: Number(d.coins) || 0, shards: Number(d.shards) || 0 });
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => { void loadWallet(); }, [loadWallet]);

  const buyPack = useCallback(async (packId: string) => {
    setBusy(packId);
    try {
      const res = await fetch('/api/v1/wallet/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: packId }),
      });
      if (res.status === 503) {
        toast.info('Coin purchases are coming soon', { description: 'Real-money checkout is not enabled yet on this site.' });
        return;
      }
      const d = await res.json();
      if (res.ok && d.url) {
        window.location.href = d.url; // Stripe Checkout
        return;
      }
      toast.error('Could not start checkout', { description: d?.error ?? 'Please try again.' });
    } catch {
      toast.error('Could not start checkout');
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-10">
      {/* Balance header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Coin Store</h1>
          {/* ARENA-10PHASE P10 said "sold separately" unconditionally; FEATURES-UX-SHOP: the line is the purchases flag's own words,
              and "Shard Store" is the link in every state. */}
          <p className="text-sm text-white/50">
            {copy.coinStoreShards.split('Shard Store')[0]}
            <Link href="/shop/shards" className="text-[#C79BFF] hover:underline">Shard Store</Link>
            {copy.coinStoreShards.split('Shard Store')[1]}
          </p>
          <Link href="/wallet" className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#00E5FF] hover:underline">
            <History className="h-3.5 w-3.5" /> View wallet history
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#FFD700]/40 bg-[#FFD700]/5 px-3 py-2 font-mono text-sm text-[#FFD700]">
            <Coins className="h-4 w-4" /> {balances.coins.toLocaleString('en-US')}
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#A855F7]/40 bg-[#A855F7]/5 px-3 py-2 font-mono text-sm text-[#C79BFF]">
            <Gem className="h-4 w-4" /> {balances.shards.toLocaleString('en-US')}
          </span>
        </div>
      </div>

      {/* Coin packs */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-[#00E5FF]" />
          <h2 className="text-lg font-semibold text-white">Coin Packs</h2>
          {copy.badge && (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">{copy.badge}</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COIN_STORE_PACKS.map((pack, i) => {
            const total = coinStorePackTotal(pack);
            return (
              <motion.div
                key={pack.id}
                initial={{ y: 12 }}
                animate={{ y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                className="relative flex flex-col rounded-xl border border-[#FFD700]/25 bg-gradient-to-b from-[#FFD700]/[0.06] to-transparent p-4"
              >
                {pack.tag && (
                  <span className="absolute -top-2 right-3 rounded-full bg-[#00E5FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">{pack.tag}</span>
                )}
                <div className="mb-1 flex items-center gap-2 text-[#FFD700]">
                  <Coins className="h-5 w-5" />
                  <span className="font-mono text-xl font-bold">{total.toLocaleString('en-US')}</span>
                </div>
                <div className="text-sm font-semibold text-white">{pack.label}</div>
                <div className="mb-3 mt-0.5 flex-1 text-xs text-white/50">{pack.blurb}</div>
                {/* P10: one truth — while checkout is not configured the badge says COMING SOON and the button agrees (it used to
                    read $4.99 and only fail after the click) */}
                <button
                  onClick={() => buyPack(pack.id)}
                  disabled={busy === pack.id || purchasesEnabled === false}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFD700] px-3 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : purchasesEnabled === false ? `${usd(pack.priceUsdCents)} · coming soon` : usd(pack.priceUsdCents)}
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Spend Your Balance: where each thing is sold and delivered (see WHERE_TO_SPEND) */}
      <section>
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#00FF9D]" />
          <h2 className="text-lg font-semibold text-white">Spend Your Balance</h2>
        </div>
        <p className="mb-3 text-xs text-white/50">Coins and shards are spent on the page that uses what you buy.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WHERE_TO_SPEND.map((w) => {
            const isShard = w.currency === 'shards';
            return (
              <Link
                key={w.href}
                href={w.href}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
              >
                <span>
                  <span className="block text-sm font-semibold text-white">{w.place}</span>
                  <span className="block text-xs text-white/50">{w.what}</span>
                </span>
                <span className={`inline-flex items-center gap-1 text-xs ${isShard ? 'text-[#C79BFF]' : 'text-[#FFD700]'}`}>
                  {isShard ? <Gem className="h-3.5 w-3.5" /> : <Coins className="h-3.5 w-3.5" />} {w.currency}
                  <ChevronRight className="h-4 w-4 text-white/40" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default CoinStore;
