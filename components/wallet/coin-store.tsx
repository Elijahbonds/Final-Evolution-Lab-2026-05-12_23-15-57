'use client';

/**
 * components/wallet/coin-store.tsx — Coin store + spend catalog (monetization).
 *
 * Three sections:
 *   1. Coin packs  — real-money purchase via Stripe Checkout (coins ONLY).
 *   2. Spend catalog — spend earned coins / shards on entitlements.
 *   3. Owned — the player's current entitlements.
 *
 * All prices are SERVER-OWNED; the client only sends a pack id / sku id and
 * an idempotency key. Balances are always the authoritative server values.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Coins, Gem, Loader2, Check, ShoppingCart, Sparkles, History } from 'lucide-react';
import { toast } from 'sonner';
import { COIN_STORE_PACKS, CATALOG, coinStorePackTotal, type CatalogSku } from '@/lib/wallet/catalog';
import { newIdempotencyKey, syncWalletBalances } from '@/lib/wallet/client';

interface Balances { coins: number; shards: number }

const SKU_META: Record<string, { name: string; blurb: string }> = {
  dunk_retry_token: { name: 'Dunk Retry Token', blurb: 'Instantly retry a failed dunk routine without losing your streak.' },
  dunk_style_slot: { name: 'Dunk Style Slot', blurb: 'Unlock a permanent extra style slot for signature dunk chains.' },
};

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CoinStore() {
  const [balances, setBalances] = useState<Balances>({ coins: 0, shards: 0 });
  const [purchasesEnabled, setPurchasesEnabled] = useState<boolean | null>(null);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    try {
      const [w, e] = await Promise.all([
        fetch('/api/v1/wallet', { cache: 'no-store' }),
        fetch('/api/v1/wallet/entitlements', { cache: 'no-store' }),
      ]);
      if (w.ok) {
        const d = await w.json();
        setBalances({ coins: Number(d.coins) || 0, shards: Number(d.shards) || 0 });
      }
      if (e.ok) {
        const d = await e.json();
        const map: Record<string, number> = {};
        for (const it of d.entitlements ?? []) map[it.sku_id] = it.quantity;
        setOwned(map);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    void loadWallet();
    fetch('/api/v1/wallet/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { purchasesEnabled: false }))
      .then((d) => setPurchasesEnabled(Boolean(d.purchasesEnabled)))
      .catch(() => setPurchasesEnabled(false));
  }, [loadWallet]);

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

  const spendSku = useCallback(async (sku: CatalogSku) => {
    setBusy(sku.skuId);
    try {
      const res = await fetch('/api/v1/wallet/spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), sku_id: sku.skuId, quantity: 1 }),
      });
      const d = await res.json();
      if (res.status === 409) {
        toast.error('Not enough ' + sku.currency, { description: `You need ${sku.unitPrice} ${sku.currency}.` });
        if (d?.balances) setBalances(d.balances);
        return;
      }
      if (!res.ok) {
        toast.error('Purchase failed', { description: d?.error ?? 'Please try again.' });
        return;
      }
      const meta = SKU_META[sku.skuId];
      toast.success(`Unlocked ${meta?.name ?? sku.skuId}`, {
        description: `-${sku.unitPrice} ${sku.currency}`,
      });
      if (d?.balances) {
        setBalances(d.balances);
        syncWalletBalances(d.balances); // update the header HUD (no toast)
      }
      void loadWallet();
    } catch {
      toast.error('Purchase failed');
    } finally {
      setBusy(null);
    }
  }, [loadWallet]);

  const skus = Object.values(CATALOG);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-10">
      {/* Balance header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Coin Store</h1>
          <p className="text-sm text-white/50">Top up coins, spend on unlocks. Shards are earned only — never for sale.</p>
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
          {purchasesEnabled === false && (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/50">Coming soon</span>
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
                <button
                  onClick={() => buyPack(pack.id)}
                  disabled={busy === pack.id}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFD700] px-3 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-60"
                >
                  {busy === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : usd(pack.priceUsdCents)}
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Spend catalog */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#00FF9D]" />
          <h2 className="text-lg font-semibold text-white">Spend Your Balance</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {skus.map((sku) => {
            const meta = SKU_META[sku.skuId] ?? { name: sku.skuId, blurb: '' };
            const isShard = sku.currency === 'shards';
            const ownedQty = owned[sku.skuId] ?? 0;
            const canAfford = (isShard ? balances.shards : balances.coins) >= sku.unitPrice;
            const permanentOwned = !sku.consumable && ownedQty > 0;
            return (
              <div key={sku.skuId} className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{meta.name}</span>
                  <span className={`inline-flex items-center gap-1 font-mono text-sm ${isShard ? 'text-[#C79BFF]' : 'text-[#FFD700]'}`}>
                    {isShard ? <Gem className="h-3.5 w-3.5" /> : <Coins className="h-3.5 w-3.5" />} {sku.unitPrice}
                  </span>
                </div>
                <div className="mb-3 flex-1 text-xs text-white/50">{meta.blurb}</div>
                {ownedQty > 0 && (
                  <div className="mb-2 text-[11px] text-white/40">Owned: {ownedQty}{sku.consumable ? '' : ' (permanent)'}</div>
                )}
                {permanentOwned ? (
                  <span className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-3 py-2 text-sm font-semibold text-[#00FF9D]">
                    <Check className="h-4 w-4" /> Unlocked
                  </span>
                ) : (
                  <button
                    onClick={() => spendSku(sku)}
                    disabled={busy === sku.skuId || !canAfford}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {busy === sku.skuId ? <Loader2 className="h-4 w-4 animate-spin" /> : canAfford ? (sku.consumable ? 'Buy' : 'Unlock') : 'Not enough ' + sku.currency}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default CoinStore;
