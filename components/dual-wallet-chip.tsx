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
import { Coins, Gem } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { WALLET_EARN_EVENT, WALLET_SYNC_EVENT, type WalletEarnDetail, type WalletSyncDetail } from '@/lib/wallet/client';

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
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await fetch('/api/v1/wallet', { cache: 'no-store' });
      if (!res.ok) throw new Error(`wallet ${res.status}`);
      const data: { coins: number; shards: number } = await res.json();
      if (mine !== seq.current) return; // a newer fetch already won
      coins.set(Number.isFinite(data.coins) ? data.coins : 0);
      shards.set(Number.isFinite(data.shards) ? data.shards : 0);
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
        setState('ready');
      }
      const g = detail?.granted;
      if (g && (g.coins > 0 || g.shards > 0)) {
        const parts: string[] = [];
        if (g.coins > 0) parts.push(`+${g.coins.toLocaleString('en-US')} coins`);
        if (g.shards > 0) parts.push(`+${g.shards} shards`);
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
  }, [refresh, coins, shards]);

  return (
    <div
      className={cn('inline-flex items-center gap-1.5', className)}
      aria-label="Coins and shards balance"
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
    </div>
  );
}

export default DualWalletChip;
