'use client';

// Five-tab shell — Lab / Train / Arena / Status / Profile.
//
// This is the shell the design bible specifies (§2 "Five-Tab Shell UI Polish",
// and §7.5, which makes "five-tab shell conventions intact" a condition for ANY
// mode to be marked complete). The nav previously shipped six different tabs
// (Home / Modes / Create / Live / Coach / Profile), so no mode could satisfy
// §7.5 — including Streetball, the declared gold-standard reference. Fixing the
// shell once clears that gate for every mode at the same time.
//
// Every tab points at a route that already exists; none of these are invented.
// The tabs that lost their primary slot (Home, Create, Live, Coach) move to the
// secondary row rather than becoming unreachable.
//
// NOTE (flagged, not invented): §5.3 describes a single Shared Profile Object —
// PRQ + Movement Signature + Educational Credentials + Performance History.
// There is no one route that composes all four today, so Status points at
// /sessions, the nearest existing surface (performance history). Building the
// real composed Status view is a separate piece of work.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Beaker, Dumbbell, Swords, Activity, User } from 'lucide-react';

/** The five canonical tabs. Order is the bible's order. */
const TABS = [
  { href: '/modes', label: 'Lab', icon: Beaker },
  { href: '/workout', label: 'Train', icon: Dumbbell },
  { href: '/arena', label: 'Arena', icon: Swords },
  { href: '/sessions', label: 'Status', icon: Activity },
  { href: '/profile', label: 'Profile', icon: User },
];

/** Kept reachable, just not primary. */
const SECONDARY = [
  { href: '/', label: 'Home' },
  { href: '/create', label: 'Create' },
  { href: '/live', label: 'Live' },
  { href: '/coach', label: 'Coach' },
  { href: '/support', label: 'Support' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-[#0F0F13]/90 backdrop-blur-md">
      <div className="mx-auto grid max-w-3xl grid-cols-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? 'text-[#00E5FF]' : 'text-white/45 hover:text-white/80'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]' : ''}`} />
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 pb-1.5 pt-0.5">
        {SECONDARY.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-[9px] text-white/40 transition-colors hover:text-white/60"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
