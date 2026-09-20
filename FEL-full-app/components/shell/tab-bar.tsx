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

export function TabBar() {
  const pathname = usePathname() || '/';
  const active = tabForPath(pathname);
  // The bar is for getting around the app, not for sitting on top of a game. A mode running full-screen keeps it.
  if (pathname.startsWith('/play/') || pathname.startsWith('/dev/')) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#050505]/90 backdrop-blur-xl
                 md:inset-x-auto md:bottom-auto md:left-1/2 md:top-3 md:-translate-x-1/2 md:rounded-2xl md:border"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around md:max-w-none md:gap-1 md:px-1.5 md:py-1.5">
        {TABS.map((t) => {
          const on = active?.id === t.id;
          const Icon = t.icon;
          return (
            <li key={t.id} className="flex-1 md:flex-none">
              <Link
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className="group relative flex flex-col items-center gap-1 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]
                           transition-colors md:flex-row md:gap-2 md:rounded-xl md:px-4 md:py-2 md:pb-2"
                style={{ color: on ? t.accent : 'rgba(255,255,255,0.45)' }}
              >
                {/* the lit tab carries its own colour as a soft wash rather than a hard pill */}
                {on && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-3 inset-y-1 rounded-xl md:inset-x-0"
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
        })}
      </ul>
    </nav>
  );
}
