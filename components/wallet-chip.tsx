'use client';

/**
 * components/wallet-chip.tsx — Lab Credits balance chip for the app header.
 *
 * Premium-dark, high-contrast, minimal. Fetches the authoritative balance
 * from GET /api/wallet (the client NEVER computes balances) and count-up
 * animates changes with framer-motion.
 *
 * Refresh triggers:
 *   - mount
 *   - window refocus (cheap freshness after a play session)
 *   - a `wallet:refresh` CustomEvent — dispatch after any earn/spend, e.g.
 *       window.dispatchEvent(new Event('wallet:refresh'));
 *     from shop-view after a purchase or game-shell after a session post.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

export const WALLET_REFRESH_EVENT = 'wallet:refresh';

interface WalletChipProps {
  className?: string;
}

type FetchState = 'loading' | 'ready' | 'error';

export function WalletChip({ className }: WalletChipProps) {
  const [state, setState] = useState<FetchState>('loading');
  const [pulse, setPulse] = useState(0);

  const balanceValue = useMotionValue(0);
  const displayBalance = useTransform(balanceValue, (v) =>
    Math.round(v).toLocaleString()
  );

  // Track in-flight fetches so a stale response never overwrites a newer one.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const res = await fetch('/api/wallet', { cache: 'no-store' });
      if (!res.ok) throw new Error(`wallet fetch ${res.status}`);
      const data: { balance: number } = await res.json();
      if (seq !== requestSeq.current) return; // stale response

      const next = Number.isFinite(data.balance) ? data.balance : 0;
      const prev = balanceValue.get();
      if (next !== prev) {
        animate(balanceValue, next, { duration: 0.8, ease: 'easeOut' });
        setPulse((p) => p + 1); // retrigger the pulse animation on change
      }
      setState('ready');
    } catch {
      if (seq === requestSeq.current) setState('error');
    }
  }, [balanceValue]);

  useEffect(() => {
    void refresh();

    const onRefresh = () => void refresh();
    window.addEventListener(WALLET_REFRESH_EVENT, onRefresh);
    window.addEventListener('focus', onRefresh);
    return () => {
      window.removeEventListener(WALLET_REFRESH_EVENT, onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, [refresh]);

  return (
    <motion.div
      key={pulse}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.06, 1] }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={cn(
        'inline-flex select-none items-center gap-1.5 rounded-full',
        'border border-zinc-800 bg-zinc-950/80 px-3 py-1.5',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur',
        className
      )}
      aria-label="Lab Credits balance"
      title="Lab Credits"
    >
      <Coins className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
      {state === 'error' ? (
        <span className="text-xs font-medium tracking-wide text-zinc-500">—</span>
      ) : (
        <motion.span
          className={cn(
            'font-mono text-sm font-semibold tabular-nums tracking-tight text-zinc-100',
            state === 'loading' && 'animate-pulse text-zinc-500'
          )}
        >
          {displayBalance}
        </motion.span>
      )}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        LC
      </span>
    </motion.div>
  );
}

export default WalletChip;
