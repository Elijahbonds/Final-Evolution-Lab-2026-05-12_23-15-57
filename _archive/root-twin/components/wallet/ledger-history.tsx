'use client';

/**
 * components/wallet/ledger-history.tsx — the player's coins/shards audit trail.
 *
 * Read-only, cursor-paginated view of GET /api/v1/wallet/ledger. Every balance
 * change (earn, spend, purchase, refund) is a row; the running balance is shown
 * per currency so the history is self-auditing.
 */

import { useCallback, useEffect, useState } from 'react';
import { Coins, Gem, ArrowDownRight, ArrowUpRight, Loader2, History } from 'lucide-react';
import { reasonLabel } from '@/lib/wallet/reason-labels';

interface Entry {
  id: string;
  currency: 'coins' | 'shards';
  delta: number;
  balance_after: number;
  reason_code: string;
  source: string;
  created_at: string;
}

function fmtDate(iso: string): string {
  // Fixed locale + timezone to keep SSR/CSR consistent (this is client-only anyway).
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function LedgerHistory() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);

  const loadMore = useCallback(async (reset = false) => {
    if (loading) return;
    setLoading(true);
    setErr(false);
    try {
      const url = new URL('/api/v1/wallet/ledger', window.location.origin);
      url.searchParams.set('limit', '25');
      if (!reset && cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      const rows: Entry[] = d.entries ?? [];
      setEntries((prev) => (reset ? rows : [...prev, ...rows]));
      setCursor(d.next_cursor);
      if (!d.next_cursor) setDone(true);
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, [loading, cursor]);

  useEffect(() => { void loadMore(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <section className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-5 w-5 text-[#00E5FF]" />
        <h1 className="text-xl font-bold text-white">Wallet History</h1>
      </div>

      {entries.length === 0 && done && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/50">
          No wallet activity yet. Play a mode to start earning coins and shards.
        </div>
      )}

      <ul className="space-y-2">
        {entries.map((e) => {
          const meta = reasonLabel(e.reason_code);
          const positive = e.delta >= 0;
          const isShard = e.currency === 'shards';
          return (
            <li key={e.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${positive ? 'bg-[#00FF9D]/10 text-[#00FF9D]' : 'bg-[#FF3366]/10 text-[#FF3366]'}`}>
                {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{meta.label}</div>
                <div className="text-[11px] text-white/40">{fmtDate(e.created_at)}</div>
              </div>
              <div className={`flex items-center gap-1 font-mono text-sm font-semibold ${positive ? 'text-[#00FF9D]' : 'text-[#FF3366]'}`}>
                {positive ? '+' : ''}{e.delta.toLocaleString('en-US')}
                {isShard ? <Gem className="h-3.5 w-3.5 text-[#C79BFF]" /> : <Coins className="h-3.5 w-3.5 text-[#FFD700]" />}
              </div>
              <div className="w-16 shrink-0 text-right font-mono text-[11px] text-white/40">{e.balance_after.toLocaleString('en-US')}</div>
            </li>
          );
        })}
      </ul>

      {err && <div className="mt-4 text-center text-sm text-[#FF3366]">Could not load history. <button onClick={() => loadMore(true)} className="underline">Retry</button></div>}

      {!done && !err && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => loadMore(false)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
          </button>
        </div>
      )}
    </section>
  );
}

export default LedgerHistory;
