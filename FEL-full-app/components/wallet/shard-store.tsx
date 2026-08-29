'use client';

/**
 * components/wallet/shard-store.tsx — the ONE real-money storefront (M25).
 *
 * Buys SHARD packs via Stripe Checkout (hosted page). No card fields ever live
 * in-app. The shard amount is server-owned; this UI only sends a pack_id. On
 * return, ?paid=1 shows a success toast + refreshes the wallet balance, and
 * ?canceled=1 shows an info toast.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Gem, Sparkles, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { SHARD_PACKS, shardPackTotal, usd, type ShardPack } from '@/lib/shard-packs';

export function ShardStore() {
  const params = useSearchParams();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  async function refreshBalance() {
    try {
      const r = await fetch('/api/v1/wallet', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (typeof j?.shards === 'number') setBalance(j.shards);
      }
    } catch { /* non-fatal */ }
  }

  useEffect(() => { refreshBalance(); }, []);

  // Handle the post-checkout redirect once.
  useEffect(() => {
    if (params.get('paid') === '1') {
      toast.success('Shards added!', { description: 'Your purchase is confirmed. Balance updates in a moment.' });
      // Poll a few times — the webhook credits shards asynchronously.
      let n = 0;
      const iv = setInterval(() => { refreshBalance(); if (++n >= 5) clearInterval(iv); }, 1500);
      window.history.replaceState({}, '', '/shop/shards');
      return () => clearInterval(iv);
    }
    if (params.get('canceled') === '1') {
      toast('Checkout canceled', { description: 'No charge was made.' });
      window.history.replaceState({}, '', '/shop/shards');
    }
  }, [params]);

  async function buy(pack: ShardPack) {
    setBusyId(pack.id);
    try {
      const r = await fetch('/api/v1/wallet/shard-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: pack.id }),
      });
      if (r.status === 503) {
        toast('Purchases coming soon', { description: 'The shard store is not open just yet. Check back shortly.' });
        return;
      }
      if (r.status === 401) {
        toast.error('Please sign in', { description: 'You need to be signed in to buy shards.' });
        return;
      }
      const j = await r.json();
      if (r.ok && j?.url) {
        window.location.href = j.url as string;
        return;
      }
      toast.error('Could not start checkout', { description: 'Please try again in a moment.' });
    } catch {
      toast.error('Could not start checkout', { description: 'Please try again in a moment.' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Gem className="h-6 w-6 text-[#C79BFF]" /> Get Shards
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Shards are the premium currency for plans, scans, class passes, seminars &amp; 1-on-1s.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-[#C79BFF]/30 bg-[#C79BFF]/5 px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-wide text-white/40">Balance</div>
          <div className="flex items-center justify-end gap-1 text-lg font-bold text-[#C79BFF]">
            <Gem className="h-4 w-4" /> {balance === null ? '—' : balance.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SHARD_PACKS.map((pack) => {
          const total = shardPackTotal(pack);
          const busy = busyId === pack.id;
          return (
            <div
              key={pack.id}
              className="relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#C79BFF]/40 hover:bg-[#C79BFF]/[0.04]"
            >
              {pack.badge && (
                <span className="absolute -top-2 right-4 rounded-full bg-[#A855F7] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg">
                  {pack.badge}
                </span>
              )}
              <div className="text-sm font-semibold text-white/70">{pack.name}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <Gem className="h-6 w-6 text-[#C79BFF]" />
                <span className="text-3xl font-extrabold text-white">{total.toLocaleString()}</span>
                <span className="text-sm text-white/40">shards</span>
              </div>
              {pack.bonus > 0 && (
                <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#00FF9D]">
                  <Sparkles className="h-3.5 w-3.5" /> includes +{pack.bonus.toLocaleString()} bonus
                </div>
              )}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-lg font-bold text-white">{usd(pack.usdCents)}</span>
                <button
                  onClick={() => buy(pack)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#C79BFF] px-4 py-2 text-sm font-bold text-[#0a0416] transition hover:bg-[#d6b3ff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gem className="h-4 w-4" />}
                  {busy ? 'Starting…' : 'Buy'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Age gate + refund policy (required store copy). */}
      <div className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-xs leading-relaxed text-white/50">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#00E5FF]" />
          <p>
            <span className="font-semibold text-white/70">Secure checkout.</span> Payments are processed on a secure hosted
            checkout page — we never see or store your card details.
          </p>
        </div>
        <p>
          <span className="font-semibold text-white/70">Age notice:</span> If you are under 18, please ask a parent or
          guardian before making a purchase.
        </p>
        <p>
          <span className="font-semibold text-white/70">Refund policy:</span> Shards are a prepaid virtual currency with no
          cash value and cannot be cashed out. A purchase is refundable only while its shards remain unspent; once shards
          are spent they are non-refundable.
        </p>
      </div>
    </div>
  );
}
