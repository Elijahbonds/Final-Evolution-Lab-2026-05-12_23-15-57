// The profile's body, top to bottom (PROFILE V2; layout and data map in docs/PROFILE-V2.md). Server-safe: the page
// renders it with the data it read, and the phone rig renders the same component.
import Link from 'next/link';
import { Gem, Shirt, Store, CalendarDays, PersonStanding, Settings, PenLine } from 'lucide-react';
import type { ProfileV2Data } from '@/lib/profile-v2/assemble';
import { ProgressHeader } from './progress-header';
import { StatsSection } from './stats-section';
import { BadgesSection } from './badges-section';
import { SquadSection } from './squad-section';
import { HighlightsSection } from './highlights-section';
import { PrivacySection } from './privacy-section';

const SHORTCUTS = [
  // HOTFIX (2026-09-24): the athlete creator shipped with no link anywhere -- reachable only by typing
  // /creator/athlete. It is who you are on court, so it sits first, beside the Closet that dresses the same body.
  { href: '/creator/athlete', icon: PersonStanding, accent: '#FFD700', label: 'Athlete' },
  { href: '/closet', icon: Shirt, accent: '#00E5FF', label: 'Closet' },
  { href: '/store', icon: Store, accent: '#FF7A2F', label: 'Store' },
  { href: '/wallet', icon: Gem, accent: '#A855F7', label: 'Wallet' },
  { href: '/sessions', icon: CalendarDays, accent: '#00FF9D', label: 'Sessions' },
];

/** Edit and settings, beside the name: everything you change lives one tap away, not on the profile itself. */
export function ProfileActions() {
  const cls = 'inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white';
  return (
    <div className="flex gap-2">
      <Link href="/profile/edit" className={cls}><PenLine className="h-3.5 w-3.5" aria-hidden /> Edit profile</Link>
      <Link href="/account" className={cls}><Settings className="h-3.5 w-3.5" aria-hidden /> Settings</Link>
    </div>
  );
}

export function ProfileBody({ data }: { data: ProfileV2Data }) {
  return (
    <>
      <ProgressHeader data={data} />
      <StatsSection data={data} />
      <BadgesSection data={data} />
      <SquadSection data={data} />
      <HighlightsSection data={data} />
      <PrivacySection data={data} />
      <nav aria-label="Your stuff" className="mt-9 flex flex-wrap gap-2">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2 text-[12.5px] font-bold text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white">
              <Icon className="h-[15px] w-[15px]" style={{ color: s.accent }} strokeWidth={2.1} />
              {s.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
