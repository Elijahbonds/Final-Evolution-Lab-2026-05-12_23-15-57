// The profile's body, top to bottom (PROFILE V2; layout and data map in docs/PROFILE-V2.md). Server-safe: the page
// renders it with the data it read, and the phone rig renders the same component.
import { Gem, Shirt, Store, CalendarDays, PersonStanding, Settings, PenLine } from 'lucide-react';
import type { ProfileV2Data } from '@/lib/profile-v2/assemble';
import type { PosterKey } from '@/lib/profile-v2/athletePoster';
import { ProgressHeader } from './progress-header';
import { StatsSection } from './stats-section';
import { BadgesSection } from './badges-section';
import { SquadSection } from './squad-section';
import { HighlightsSection } from './highlights-section';
import { PrivacySection } from './privacy-section';
import { Chip } from '@/components/ui/fel/chip';
import { t } from '@/lib/i18n';

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
  // premium-ui P4: two quiet doors beside the docked primary (the week card), on the kit's chip
  return (
    <>
      <Chip href="/profile/edit" icon={<PenLine className="h-4 w-4" aria-hidden />}>{t('profile.edit')}</Chip>
      <Chip href="/account" icon={<Settings className="h-4 w-4" aria-hidden />}>{t('profile.settings')}</Chip>
    </>
  );
}

/** `poster`: the device key for the athlete's kept picture (app/profile/page.tsx; lib/profile-v2/athletePoster.ts). */
export function ProfileBody({ data, poster = null }: { data: ProfileV2Data; poster?: PosterKey | null }) {
  return (
    <>
      <ProgressHeader data={data} poster={poster} />
      <StatsSection data={data} />
      <BadgesSection data={data} />
      <SquadSection data={data} />
      <HighlightsSection data={data} />
      <PrivacySection data={data} />
      <nav aria-label="Your stuff" className="mt-9 flex flex-wrap gap-2">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon;
          return (
            <Chip key={s.href} href={s.href} icon={<Icon className="h-4 w-4" style={{ color: s.accent }} strokeWidth={2.1} aria-hidden />}>
              {s.label}
            </Chip>
          );
        })}
      </nav>
    </>
  );
}
