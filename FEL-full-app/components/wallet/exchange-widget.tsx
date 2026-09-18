'use client';

/**
 * Coin → Shard exchange. Shards are never sold directly; this converts the
 * real-money coin balance into shards at a server-owned rate, giving a
 * purchase-driven path to the shard-gated premium surfaces (workouts, scans,
 * class passes, sessions). Client sends only the shard amount; price is owned
 * by the server.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Coins, Gem, ArrowRight, Loader2, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { newIdempotencyKey, syncWalletBalances } from '@/lib/wallet/client';

const PRESETS = [5, 10, 25, 50, 100];

export function ExchangeWidget() {
  const [rate, setRate] = useState(20);
  const [bal, setBal] = useState<{ coins: number; shards: number } | null>(null);
  const [shards, setShards] = useState(10);
  const [busy, setBusy] = useState(false);

  const loadBal = async () => {
    try {
      const [r, w] = await Promise.all([fetch('/api/v1/wallet/exchange'), fetch('/api/v1/wallet')]);
      const rj = await r.json(); const wj = await w.json();
      if (r.ok && rj?.coins_per_shard) setRate(rj.coins_per_shard);
      if (w.ok) setBal({ coins: wj.coins, shards: wj.shards });
    } catch { /* ignore */ }
  };
  useEffect(() => { loadBal(); }, []);

  const coinCost = shards * rate;
  const affordable = bal ? bal.coins >= coinCost : true;

  const doExchange = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/wallet/exchange', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), shard_amount: shards }),
      });
      const j = await res.json();
      if (res.status === 409) { toast.error('Not enough coins. Top up in the Coin Store.'); await loadBal(); return; }
      if (!res.ok) throw new Error(j?.error || 'exchange failed');
      if (j?.balances) { setBal(j.balances); syncWalletBalances(j.balances); }
      toast.success(`Exchanged ${coinCost} coins for ${shards} shards!`);
    } catch (e: any) { toast.error(e?.message || 'Exchange failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto mt-4 max-w-3xl px-4">
      <div className="rounded-2xl border border-[#A855F7]/30 bg-gradient-to-br from-[#A855F7]/10 to-transparent p-5">
        <div className="mb-1 flex items-center gap-2">
          <Gem className="h-5 w-5 text-[#C79BFF]" />
          <h2 className="fel-heading text-lg font-bold text-white">Get Shards</h2>
        </div>
        <p className="mb-4 text-xs text-white/50">Shards unlock personalized plans, scans, class passes, and live sessions. Convert coins to shards at {rate} coins = 1 shard.</p>

        {bal && (
          <div className="mb-4 flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-[#FFD700]"><Coins className="h-4 w-4" /> {bal.coins.toLocaleString()}</span>
            <span className="flex items-center gap-1 text-[#C79BFF]"><Gem className="h-4 w-4" /> {bal.shards.toLocaleString()}</span>
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <button key={n} onClick={() => setShards(n)} className="rounded-full px-3 py-1.5 text-xs font-bold transition" style={{ backgroundColor: shards === n ? '#A855F7' : 'rgba(255,255,255,0.06)', color: shards === n ? '#fff' : 'rgba(255,255,255,0.7)' }}>{n} ◆</button>
          ))}
          <input
            type="number" min={5} max={1000} value={shards}
            onChange={(e) => setShards(Math.max(5, Math.min(1000, Math.floor(Number(e.target.value) || 0))))}
            className="w-20 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 rounded-xl bg-black/30 px-4 py-3 text-sm font-bold text-white">
            <Coins className="h-4 w-4 text-[#FFD700]" /> {coinCost.toLocaleString()}
            <ArrowRight className="h-4 w-4 text-white/40" />
            <Gem className="h-4 w-4 text-[#C79BFF]" /> {shards.toLocaleString()}
          </div>
          <button onClick={doExchange} disabled={busy || !affordable} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#A855F7] py-3 text-sm font-bold text-white transition hover:bg-[#9333EA] disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gem className="h-4 w-4" />} {affordable ? 'Exchange' : 'Not enough coins'}
          </button>
        </div>

        {!affordable && (
          <Link href="/store" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#FFD700] hover:underline">
            <ShoppingCart className="h-3.5 w-3.5" /> Buy more coins
          </Link>
        )}
      </div>
    </div>
  );
}
