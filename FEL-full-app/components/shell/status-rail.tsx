'use client';

// StatusRail — the one bar at the top of a signed-in app.
//
// What it replaces: AppHeader, mounted by hand on thirty-three pages, carrying the logo, a PRQ chip, a COACH door,
// a TRAIN door, a FUEL door, a wallet chip, an LC chip, a metrics chip and a sign-out button. Nine things in a row,
// most of them shouting in a different colour. That header is the clutter, and three of its doors are now tabs or
// live inside one — Train owns the coach product, the programming and the Fuel floor, Profile owns the wallet.
//
// So the rail keeps only what is true everywhere and belongs nowhere else: who you are (PRQ), what you have
// (wallet), and the way out. On a desktop the three tabs sit in the middle of it, because one bar reads as one
// piece of furniture and a bar plus a floating pill reads as two. On a phone the tabs stay at the bottom where a
// thumb is, and the rail is just the status strip.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { BarChart3, LogOut, Zap } from 'lucide-react';
import { WALLET_REFRESH_EVENT } from '@/components/wallet-chip';
import { DualWalletChip } from '@/components/dual-wallet-chip';
import { TabBar, chromeHiddenFor } from '@/components/shell/tab-bar';

interface RailData { prq: number; gradeLabel: string; gradeColor: string; isAdmin: boolean }

export function StatusRail() {
  const pathname = usePathname() || '/';
  const { status } = useSession();
  const [data, setData] = useState<RailData | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const fetchData = () => {
      fetch('/api/profile')
        .then((r) => (r?.ok ? r.json() : null))
        .then((j) => {
          if (!j?.profile) return;
          setData({
            prq: j?.prq ?? 0,
            gradeLabel: j?.grade?.label ?? 'READY',
            gradeColor: j?.grade?.color ?? '#00FF9D',
            isAdmin: j?.role === 'admin',
          });
        })
        .catch(() => {});
    };
    fetchData();
    window.addEventListener(WALLET_REFRESH_EVENT, fetchData);
    window.addEventListener('focus', fetchData);
    return () => {
      window.removeEventListener(WALLET_REFRESH_EVENT, fetchData);
      window.removeEventListener('focus', fetchData);
    };
  }, [status]);

  // A running mode gets the whole screen. A signed-out visitor gets PublicTopBar, which the legal pages mount.
  if (chromeHiddenFor(pathname) || status !== 'authenticated') return null;

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#050505]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4">
        <Link href="/play" className="fel-heading shrink-0 text-[19px] font-bold leading-none text-white md:text-[21px]">
          <span className="text-[#00E5FF]">FE</span>L
        </Link>

        {/* the tabs live in the middle of the rail on a desktop, and at the bottom of the screen on a phone */}
        <div className="hidden flex-1 justify-center md:flex">
          <TabBar variant="inline" />
        </div>
        <div className="flex-1 md:hidden" />

        <div className="flex shrink-0 items-center gap-2">
          {data ? (
            <>
              <Link
                href="/profile"
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] font-bold"
                style={{ borderColor: `${data.gradeColor}33`, color: data.gradeColor, background: `${data.gradeColor}0D` }}
              >
                <Zap className="h-3.5 w-3.5" />
                {Math.round(data.prq)}
                <span className="hidden sm:inline">· {data.gradeLabel}</span>
              </Link>
              <Link href="/store" aria-label="Open the store" className="transition-transform active:scale-95">
                <DualWalletChip />
              </Link>
              {data.isAdmin && (
                <Link
                  href="/admin/metrics"
                  aria-label="Growth metrics"
                  className="hidden rounded-lg border border-white/10 p-1.5 text-white/45 transition-colors hover:text-white sm:inline-flex"
                >
                  <BarChart3 className="h-4 w-4" />
                </Link>
              )}
            </>
          ) : (
            <span className="h-6 w-20 animate-pulse rounded bg-white/10" />
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            aria-label="Sign out"
            className="rounded-lg border border-white/10 p-1.5 text-white/40 transition-colors hover:border-[#FF3366]/50 hover:text-[#FF3366]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
