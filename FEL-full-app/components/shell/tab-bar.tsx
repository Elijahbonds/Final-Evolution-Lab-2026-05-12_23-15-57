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
import { PALETTE } from '@/lib/design/palette';
import { COLOR } from '@/lib/design/tokens';
import { t } from '@/lib/i18n';
import { TYPE } from '@/lib/design/type';

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
    id: 'play', label: t('shell.tabs.play'), href: '/play', icon: Gamepad2, accent: PALETTE.cyan,
    owns: ['/play', '/modes', '/arena', '/multiplayer', '/ladder', '/story', '/try', '/venues', '/host', '/join', '/party'],
  },
  {
    id: 'train', label: t('shell.tabs.train'), href: '/train', icon: Dumbbell, accent: PALETTE.emerald,
    owns: ['/train', '/training', '/coach', '/kitchens', '/workout', '/education', '/camp', '/live', '/learn'],
  },
  {
    id: 'profile', label: t('shell.tabs.profile'), href: '/profile', icon: UserRound, accent: PALETTE.gold,
    owns: [
      '/profile', '/cards', '/card', '/closet', '/wallet', '/store', '/shop', '/market', '/creator', '/sessions',
      '/account', '/settings', '/create', '/guidance', '/signature', '/support', '/press', '/team',
    ],
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
  return pathname.startsWith('/play/')
    || pathname.startsWith('/dev/')
    // STUDIO-EASY (2026-10-28): Nexus Studio is a full-screen editor with its own header and its own way back; the rail pushed its
    // bottom strip off a desktop screen, the phone bar sat over it, and the menus' arrow-key focus moved focus while an arrow
    // nudged the selection
    || pathname === '/studio' || pathname.startsWith('/studio/')
    || pathname === '/story/boss'
    || pathname === '/story/rail';
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

  // ONE ACCENT (premium-ui P3, 2026-10-27): the lit tab is FEL cyan on every tab. It used to take the tab's own colour
  // (cyan, green, gold), which made three accents compete in the one bar the eye returns to most. The tab's own colour
  // still names it in TABS (the doors, the shelf), never here. LOOK CHANGE, flagged.
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
              ? `fel-press group relative flex min-h-14 flex-col items-center justify-center gap-1 px-4 pt-2
                 pb-[max(0.5rem,env(safe-area-inset-bottom))]`
              : 'fel-press group relative flex min-h-10 items-center gap-2 rounded-full px-4 py-1.5'
          }
          style={{ color: on ? COLOR.cyan : COLOR.textDim }}
        >
          {/* the lit tab: a soft pill of the one accent behind the icon (bar) or the whole tab (rail) */}
          <span
            aria-hidden
            className={
              variant === 'bar'
                ? 'pointer-events-none absolute left-1/2 top-1.5 h-8 w-14 -translate-x-1/2 rounded-full transition-all duration-300'
                : 'pointer-events-none absolute inset-0 rounded-full transition-all duration-300'
            }
            style={{
              background: on ? 'rgba(0, 229, 255, 0.14)' : 'transparent',
              boxShadow: on ? 'inset 0 0 0 1px rgba(0, 229, 255, 0.28), 0 0 22px -6px rgba(0, 229, 255, 0.55)' : 'none',
              transform: variant === 'bar' ? `translateX(-50%) scale(${on ? 1 : 0.6})` : undefined,
              opacity: on ? 1 : 0,
            }}
          />
          <Icon className={`relative ${variant === 'bar' ? 'mt-1 h-[20px] w-[20px]' : 'h-[18px] w-[18px]'}`} strokeWidth={on ? 2.4 : 2} />
          <span className={`relative ${TYPE.label} `}>
            {t.label}
          </span>
        </Link>
      </li>
    );
  });

  if (variant === 'inline') {
    return (
      <nav aria-label={t('shell.nav.main')}>
        <ul className="flex items-center gap-1">{items}</ul>
      </nav>
    );
  }

  return (
    // Bottom bar on a phone only: on a desktop the same tabs are inside the rail at the top.
    // PHONE-FIRST-SCREEN (owner's pick, 2026-10-17): the bar's glass also carries the soundtrack strip. SoundtrackDock
    // fills [data-tabbar-strip] with the Now Playing chip while a song plays, so the chip is chrome the page scrolls
    // under, like the tabs, and never a pill floating on a card. Empty, the strip has no height.
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-fel-bg/90 backdrop-blur-xl md:hidden">
      <div data-tabbar-strip />
      <nav aria-label={t('shell.nav.main')}>
        <ul className="mx-auto flex max-w-md items-stretch justify-around">{items}</ul>
      </nav>
    </div>
  );
}
