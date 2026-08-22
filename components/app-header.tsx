'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Coins, LogOut, Zap, BarChart3 } from 'lucide-react';
import { WALLET_REFRESH_EVENT } from '@/components/wallet-chip';
import { DualWalletChip } from '@/components/dual-wallet-chip';

interface HeaderData {
  prq: number;
  gradeLabel: string;
  gradeColor: string;
  credits: number;
  isAdmin: boolean;
}

export function AppHeader() {
  const [data, setData] = useState<HeaderData | null>(null);

  const fetchData = () => {
    fetch('/api/profile')
      .then((r) => (r?.ok ? r.json() : null))
      .then((j) => {
        if (!j?.profile) return;
        setData({
          prq: j?.prq ?? 0,
          gradeLabel: j?.grade?.label ?? 'READY',
          gradeColor: j?.grade?.color ?? '#00FF9D',
          credits: j?.profile?.labCredits ?? 0,
          isAdmin: j?.role === 'admin',
        });
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchData();
    // Refresh on wallet events (purchases, session wins, etc.)
    const onRefresh = () => fetchData();
    window.addEventListener(WALLET_REFRESH_EVENT, onRefresh);
    window.addEventListener('focus', onRefresh);
    return () => {
      window.removeEventListener(WALLET_REFRESH_EVENT, onRefresh);
      window.removeEventListener('focus', onRefresh);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050505]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3">
        <Link href="/" className="fel-heading text-2xl font-bold text-white">
          <span className="text-[#00E5FF] fel-glow-cyan">FINAL EVOLUTION</span> LAB
        </Link>
        <div className="flex items-center gap-2">
          {data ? (
            <>
              <span
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs"
                style={{ borderColor: `${data.gradeColor}55`, color: data.gradeColor }}
              >
                <Zap className="h-3.5 w-3.5" />
                PRQ {Math.round(data.prq)} · {data.gradeLabel}
              </span>
              <Link href="/store" aria-label="Open coin store" className="transition-transform active:scale-95">
                <DualWalletChip />
              </Link>
              <Link
                href="/cards"
                className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-[#FFD700]/40 px-2.5 py-1 font-mono text-xs text-[#FFD700] transition-transform active:scale-95"
              >
                <Coins className="h-3.5 w-3.5" />
                {data.credits.toLocaleString('en-US')} LC
              </Link>
              {data.isAdmin && (
                <Link
                  href="/admin/metrics"
                  aria-label="Growth metrics"
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#00E5FF]/40 px-2.5 py-1 font-mono text-xs text-[#00E5FF] transition-transform active:scale-95"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">METRICS</span>
                </Link>
              )}
            </>
          ) : (
            <span className="h-6 w-24 animate-pulse rounded bg-white/10" />
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            aria-label="Sign out"
            className="rounded-md border border-white/10 p-1.5 text-white/50 transition-colors hover:border-[#FF3366]/50 hover:text-[#FF3366]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
