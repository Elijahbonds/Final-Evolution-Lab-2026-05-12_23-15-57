'use client';

// TabBar — three tabs, because the app had thirty-three front doors and no hierarchy.
//
// Owner: "one tab where the mirror and all the coaching and training stuff lives, one for games, one for the profile
// and status." That is the whole information architecture, and it is right: everything this app does is one of three
// things — you are playing, you are working on yourself, or you are looking at who you are.
//
// PLAY     the game shelf, grouped into families (lib/nav/families)
// TRAIN    the Mirror, the movement screen, programming, the coach, the Fuel floor
// PROFILE  your card, your PRQ, the wallet, the store, your status
//
// It is a bottom bar on a phone and a top rail on a desktop, because a thumb reaches the bottom of a phone and a
// cursor lives at the top of a window. Same component, same routes, no second implementation to drift.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Dumbbell, Gamepad2, UserRound } from 'lucide-react';

export interface TabDef {
  id: 'play' | 'train' | 'profile';
  label: string;
  href: string;
  icon: typeof Gamepad2;
  accent: string;
  /** Route prefixes that belong to this tab, so the right one is lit wherever you are. */
  owns: string[];
}

export const TABS: TabDef[] = [
  {
    id: 'play', label: 'Play', href: '/play', icon: Gamepad2, accent: '#00E5FF',
    owns: ['/play', '/modes', '/arena', '/multiplayer', '/ladder', '/story', '/try'],
  },
  {
    id: 'train', label: 'Train', href: '/train', icon: Dumbbell, accent: '#00FF9D',
    owns: ['/train', '/training', '/coach', '/kitchens', '/workout', '/education', '/camp'],
  },
  {
    id: 'profile', label: 'Profile', href: '/profile', icon: UserRound, accent: '#FFD700',
    owns: ['/profile', '/cards', '/card', '/closet', '/wallet', '/store', '/shop', '/market', '/creator', '/sessions'],
  },
];

/** Which tab owns a path. Longest prefix wins, so /cards beats /c and /coach beats /c. */
export function tabForPath(pathname: string): TabDef | null {
  let best: TabDef | null = null;
  let bestLen = 0;
  for (const t of TABS) {
    for (const p of t.owns) {
      if ((pathname === p || pathname.startsWith(p + '/')) && p.length > bestLen) { best = t; bestLen = p.length; }
    }
  }
  return best;
}

/**
 * Where the shell hides itself. A running mode owns the whole screen, and the dev views are for looking at one
 * component without the app around it. Exported so the rail and the bar cannot disagree about it -- two copies of
 * this rule is how you end up with a header over a game.
 */
export function chromeHiddenFor(pathname: string): boolean {
  return pathname.startsWith('/play/') || pathname.startsWith('/dev/');
}

/**
 * `bar` is the fixed bottom bar a thumb reaches on a phone. `inline` is the same three tabs sitting inside the
 * StatusRail on a desktop, so the app has one piece of furniture at the top instead of a bar and a floating pill.
 */
export function TabBar({ variant = 'bar' }: { variant?: 'bar' | 'inline' } = {}) {
  const pathname = usePathname() || '/';
  const { status } = useSession();
  const active = tabForPath(pathname);
  // Three tabs into an app you have not joined is an offer of doors that all lead to the login page. The rail
  // already checks this; the bar did not, so a signed-out visitor on /signup got a navigation bar over the form.
  if (chromeHiddenFor(pathname) || status !== 'authenticated') return null;

  const items = TABS.map((t) => {
    const on = active?.id === t.id;
    const Icon = t.icon;
    return (
      <li key={t.id} className={variant === 'bar' ? 'flex-1' : ''}>
        <Link
          href={t.href}
          aria-current={on ? 'page' : undefined}
          className={
            variant === 'bar'
              ? `group relative flex flex-col items-center gap-1 px-4 py-2.5
                 pb-[max(0.625rem,env(safe-area-inset-bottom))] transition-colors`
              : 'group relative flex items-center gap-2 rounded-xl px-3.5 py-1.5 transition-colors'
          }
          style={{ color: on ? t.accent : 'rgba(255,255,255,0.45)' }}
        >
          {/* the lit tab carries its own colour as a soft wash rather than a hard pill */}
          {on && (
            <span
              aria-hidden
              className={
                variant === 'bar'
                  ? 'pointer-events-none absolute inset-x-3 inset-y-1 rounded-xl'
                  : 'pointer-events-none absolute inset-0 rounded-xl'
              }
              style={{ background: `${t.accent}14`, boxShadow: `inset 0 0 0 1px ${t.accent}33` }}
            />
          )}
          <Icon className="relative h-[18px] w-[18px]" strokeWidth={on ? 2.4 : 2} />
          <span className="relative font-mono text-[10px] font-bold uppercase tracking-[0.14em] md:text-[11px]">
            {t.label}
          </span>
        </Link>
      </li>
    );
  });

  if (variant === 'inline') {
    return (
      <nav aria-label="Main">
        <ul className="flex items-center gap-1">{items}</ul>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Main"
      // Bottom bar on a phone only: on a desktop the same tabs are inside the rail at the top.
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#050505]/90 backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">{items}</ul>
    </nav>
  );
}
