'use client';

/**
 * components/dual-wallet-chip.tsx — Coins + Shards balance HUD.
 *
 * Surfaces the NEW server-authoritative dual-currency wallet (separate from the
 * legacy Lab Credits chip). The client NEVER computes balances — it reads the
 * authoritative values from GET /api/v1/wallet and count-up animates changes.
 *
 * Refresh triggers:
 *   - mount
 *   - window refocus (cheap freshness after a play session)
 *   - the `fel:wallet-earn` CustomEvent dispatched by reportEarn after any earn.
 *     That event also carries the SERVER grant, which we surface as a reward
 *     toast ("+120 coins", "+2 shards").
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Coins, Gem, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { WALLET_EARN_EVENT, WALLET_SYNC_EVENT, reportEarn, type WalletEarnDetail, type WalletSyncDetail } from '@/lib/wallet/client';

type FetchState = 'loading' | 'ready' | 'error';

interface DualWalletChipProps {
  className?: string;
}

function useCountUp() {
  const value = useMotionValue(0);
  const display = useTransform(value, (v) => Math.round(v).toLocaleString('en-US'));
  const set = useCallback(
    (next: number) => {
      const prev = value.get();
      if (next !== prev) animate(value, next, { duration: 0.7, ease: 'easeOut' });
    },
    [value],
  );
  return { display, set };
}

export function DualWalletChip({ className }: DualWalletChipProps) {
  const [state, setState] = useState<FetchState>('loading');
  const coins = useCountUp();
  const shards = useCountUp();
  const lc = useCountUp();   // lab credits — the arena's and the shop's currency, folded into the wallet 2026-09-04
  const seq = useRef(0);
  const firedRef = useRef(false);
  const lastRef = useRef<{ coins: number; shards: number; lc: number } | null>(null);   // last balances we showed — a replayed earn returns the same ones

  // PACK THE FIVE #2 (2026-09-04): the first-session faucet. DAILY_FIRST_SESSION existed as a rule with no client
  // fire. The chip is auth-aware (its wallet fetch is 401 when logged out), so once the wallet reads it fires
  // ONE earn per calendar day: the idempotency key is the day plus the player's wallet identity, so the ledger
  // returns the original grant on any replay (a second tab, a reload) and a per-day localStorage mark keeps the
  // toast to the first fire. Wallet chip only — PlayerProfile.shards is not touched.
  const fireDailyFirstSession = useCallback(async () => {
    if (typeof window === 'undefined') return;
    // the PLAYER's calendar day, not UTC — a 6 pm Pacific login is still today
    const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const mark = `fel:daily_first_session:${day}`;
    try { if (window.localStorage.getItem(mark)) return; } catch { /* storage unavailable: the server key still dedupes */ }
    // the ledger's idempotency key is unique across ALL players, so it must carry this player's id — the wallet
    // response has none; the session does (id, else email)
    let who = '';
    try { const s = await fetch('/api/auth/session', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)); who = String((s?.user as { id?: string; email?: string } | undefined)?.id ?? (s?.user as { email?: string } | undefined)?.email ?? ''); } catch { /* no session → no faucet */ }
    if (!who) return;
    const ok = await reportEarn({ idempotency_key: `daily_first_session:${day}:${who}`, event_type: 'daily_first_session', payload: { day, source: 'wallet-chip' } });
    if (ok) { try { window.localStorage.setItem(mark, '1'); } catch { /* fine */ } }
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await fetch('/api/v1/wallet', { cache: 'no-store' });
      if (!res.ok) throw new Error(`wallet ${res.status}`);
      const data: { coins: number; shards: number; lc?: number } = await res.json();
      if (mine !== seq.current) return; // a newer fetch already won
      lastRef.current = { coins: data.coins, shards: data.shards, lc: data.lc ?? 0 };
      if (!firedRef.current) { firedRef.current = true; void fireDailyFirstSession(); }
      coins.set(Number.isFinite(data.coins) ? data.coins : 0);
      shards.set(Number.isFinite(data.shards) ? data.shards : 0);
      lc.set(Number.isFinite(data.lc ?? NaN) ? (data.lc as number) : 0);
      setState('ready');
    } catch {
      if (mine === seq.current) setState('error');
    }
  }, [coins, shards]);

  useEffect(() => {
    void refresh();

    const onEarn = (e: Event) => {
      const detail = (e as CustomEvent<WalletEarnDetail>).detail;
      // Apply the authoritative fresh balances immediately, then reconcile.
      if (detail?.balances) {
        coins.set(detail.balances.coins);
        shards.set(detail.balances.shards);
        if (typeof detail.balances.lc === 'number') lc.set(detail.balances.lc);
        setState('ready');
      }
      const g = detail?.granted;
      // PACK #2: a replayed idempotency key (second device, reload) returns the ORIGINAL grant with unchanged
      // balances — nothing was earned now, so nothing to toast.
      const replay = !!detail?.balances && !!lastRef.current && detail.balances.coins === lastRef.current.coins && detail.balances.shards === lastRef.current.shards;
      if (detail?.balances) lastRef.current = { coins: detail.balances.coins, shards: detail.balances.shards, lc: detail.balances.lc ?? lastRef.current?.lc ?? 0 };
      if (g && !replay && (g.coins > 0 || g.shards > 0 || (g.lc ?? 0) > 0)) {
        const parts: string[] = [];
        if (g.coins > 0) parts.push(`+${g.coins.toLocaleString('en-US')} coins`);
        if (g.shards > 0) parts.push(`+${g.shards} shards`);
        if ((g.lc ?? 0) > 0) parts.push(`+${(g.lc as number).toLocaleString('en-US')} LC`);
        toast.success(parts.join('  ·  '), {
          description: detail?.capped ? 'Daily cap reached — reduced reward' : undefined,
          duration: 2600,
        });
      }
      // Reconcile against the server in case of caps/rounding.
      void refresh();
    };

    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<WalletSyncDetail>).detail;
      if (detail?.balances) {
        coins.set(detail.balances.coins);
        shards.set(detail.balances.shards);
        setState('ready');
      }
      void refresh();
    };

    const onFocus = () => void refresh();
    window.addEventListener(WALLET_EARN_EVENT, onEarn as EventListener);
    window.addEventListener(WALLET_SYNC_EVENT, onSync as EventListener);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener(WALLET_EARN_EVENT, onEarn as EventListener);
      window.removeEventListener(WALLET_SYNC_EVENT, onSync as EventListener);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, coins, shards, lc]);

  return (
    <div
      className={cn('inline-flex items-center gap-1.5', className)}
      aria-label="Coins, shards and lab credits balance"
    >
      {/* Coins */}
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-[#FFD700]/40 bg-[#FFD700]/5 px-2.5 py-1 font-mono text-xs text-[#FFD700]"
        title="Coins — earned by playing, buyable in the shop"
      >
        <Coins className="h-3.5 w-3.5" aria-hidden="true" />
        {state === 'error' ? (
          <span className="tabular-nums">—</span>
        ) : (
          <motion.span className={cn('tabular-nums', state === 'loading' && 'animate-pulse opacity-60')}>
            {coins.display}
          </motion.span>
        )}
      </span>
      {/* Shards */}
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-[#A855F7]/40 bg-[#A855F7]/5 px-2.5 py-1 font-mono text-xs text-[#C79BFF]"
        title="Shards — prestige currency, earned only, never purchasable"
      >
        <Gem className="h-3.5 w-3.5" aria-hidden="true" />
        {state === 'error' ? (
          <span className="tabular-nums">—</span>
        ) : (
          <motion.span className={cn('tabular-nums', state === 'loading' && 'animate-pulse opacity-60')}>
            {shards.display}
          </motion.span>
        )}
      </span>
      {/* Lab credits — the arena's and the shop's currency, folded into the wallet 2026-09-04 */}
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-[#00E5FF]/40 bg-[#00E5FF]/5 px-2.5 py-1 font-mono text-xs text-[#7FEFFF]"
        title="Lab credits — the arena's stake and the shop's price"
      >
        <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
        {state === 'error' ? (
          <span className="tabular-nums">—</span>
        ) : (
          <motion.span className={cn('tabular-nums', state === 'loading' && 'animate-pulse opacity-60')}>
            {lc.display}
          </motion.span>
        )}
      </span>
    </div>
  );
}

export default DualWalletChip;
