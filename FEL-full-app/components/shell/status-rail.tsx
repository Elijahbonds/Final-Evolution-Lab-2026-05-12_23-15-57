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
import { BarChart3, BookOpen, LogOut } from 'lucide-react';
import { WALLET_REFRESH_EVENT } from '@/components/wallet-chip';
import { DualWalletChip } from '@/components/dual-wallet-chip';
import { readPrqDisplay, type PrqDisplay } from '@/lib/prq-display';
import { TabBar, chromeHiddenFor } from '@/components/shell/tab-bar';
// A11-02 / A11-05 (2026-10-25): pad and remote focus in the menus, and the couch view — mounted here, once, for every page
import { useMenuFocus } from '@/components/shell/use-menu-focus';
// PREMIUM-UI P3: the app's Motion setting onto <html> (data-fel-motion), so the CSS motion tokens honour it on every page
import { useMotionAttr } from '@/components/ui/fel/use-motion-attr';
import { ringGeometry } from '@/components/ui/fel/stat-ring';
import { t } from '@/lib/i18n';

// QA P0-01: the chip prints the MEASURED PRQ (lib/prq-display) — `prq` on the profile body is the seeded gameplay number.
interface RailData { prq: PrqDisplay; isAdmin: boolean }

export function StatusRail() {
  const pathname = usePathname() || '/';
  const { status } = useSession();
  const [data, setData] = useState<RailData | null>(null);
  useMenuFocus();
  useMotionAttr();

  useEffect(() => {
    if (status !== 'authenticated') return;
    const fetchData = () => {
      fetch('/api/profile')
        .then((r) => (r?.ok ? r.json() : null))
        .then((j) => {
          if (!j?.profile) return;
          setData({ prq: readPrqDisplay(j), isAdmin: j?.role === 'admin' });
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

  const ring = data && data.prq.score !== null ? ringGeometry(28, 6, data.prq.score, 100) : null;
  // A running mode gets the whole screen. A signed-out visitor gets PublicTopBar, which the legal pages mount.
  if (chromeHiddenFor(pathname) || status !== 'authenticated') return null;

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--fel-hairline)] bg-fel-bg/85 backdrop-blur-xl">
      <div data-couch-scale className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4">
        <Link href="/play" className="fel-heading inline-flex min-h-10 shrink-0 items-center text-[20px] font-bold leading-none text-white">
          <span className="text-fel-cyan">FE</span>L
        </Link>

        {/* the tabs live in the middle of the rail on a desktop, and at the bottom of the screen on a phone */}
        <div className="hidden flex-1 justify-center md:flex">
          <TabBar variant="inline" />
        </div>
        <div className="flex-1 md:hidden" />

        <div className="flex shrink-0 items-center gap-2">
          {/* P10 (2026-10-27): the PRQ ring and the wallet are always there — a dash and an empty track until the profile
              answers — so nothing swaps in and the cluster never shifts (the rig measured 0.006 CLS from the old skeleton swap) */}
          <>
              {/* PRQ as a mini ring (premium-ui P3): how full at a glance, the number beside it. The colour is the grade's
                  band (meaning, not decoration); the word stays for a screen reader and wider screens. */}
              <Link
                href="/profile"
                title={data?.prq.badge}
                className="fel-press inline-flex min-h-10 items-center gap-2 rounded-full border border-[color:var(--fel-hairline)] bg-white/[0.04] py-1 pl-1 pr-3 font-sans text-[14px] font-semibold tabular-nums text-white"
              >
                <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="-rotate-90">
                  <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                  {data && data.prq.score !== null && (
                    <circle cx="14" cy="14" r="11" fill="none" stroke={data.prq.color} strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={ring!.c} strokeDashoffset={ring!.offset}
                      className="fel-ring-arc" style={{ ['--fel-ring-c' as string]: `${ring!.c}` }} />
                  )}
                </svg>
                {!data || data.prq.score === null ? '—' : Math.round(data.prq.score)}
                {data && <span className="hidden text-fel-dim sm:inline">{data.prq.status}</span>}
              </Link>
              <Link href="/store" aria-label={t('shell.rail.openStore')} className="transition-transform active:scale-95">
                <DualWalletChip />
              </Link>
              {data?.isAdmin && (
                <>
                  <Link
                    href="/admin/metrics"
                    aria-label={t('shell.rail.metrics')}
                    className="fel-press hidden h-10 w-10 place-items-center rounded-full border border-[color:var(--fel-hairline)] text-fel-dim hover:text-white sm:inline-grid"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/coach/admin"
                    aria-label={t('shell.rail.kbAdmin')}
                    className="fel-press hidden h-10 w-10 place-items-center rounded-full border border-[color:var(--fel-hairline)] text-fel-dim hover:text-white sm:inline-grid"
                  >
                    <BookOpen className="h-4 w-4" />
                  </Link>
                </>
              )}
          </>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            aria-label={t('shell.rail.signOut')}
            className="fel-press grid h-10 w-10 place-items-center rounded-full border border-[color:var(--fel-hairline)] text-fel-dim hover:border-fel-crimson/50 hover:text-fel-crimson"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
