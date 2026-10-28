'use client';
// components/coach/setup/setup-screen.tsx — PLATFORM PHASE 5: everything a coach sets once, on one screen, never on the
// first one: the invite (link, QR, code and the team-app import), the calendar, automations, branding, check-in forms,
// habits, teams, combine day, reviews, and the doors to bar speed and team fees. Each row opens its existing panel in
// place (the panels are coach-delivery's and coach-parity's, unchanged); templates stay in the builder, beside the work.
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { InvitePanel } from '@/components/coach/invite-panel';
import { AutomationsPanel } from '@/components/coach/automations-panel';
import { CoachCalendar } from '@/components/coach/calendar';
import { BrandingPanel } from '@/components/coach/branding-panel';
import { CoachReviewsPanel } from '@/components/coach/reviews';
import { CheckinsPanel } from '@/components/coach/parity/checkins-panel';
import { HabitsPanel } from '@/components/coach/parity/habits-panel';
import { TeamsPanel } from '@/components/groups/teams-panel';
import { CombineEntry } from '@/components/combine/combine-entry';
import { LOOK } from '../coach-queue/look';

const ROWS: { key: string; label: string; panel: () => ReactNode }[] = [
  { key: 'invite', label: 'Invite athletes', panel: () => <InvitePanel bulk /> },
  { key: 'calendar', label: 'Calendar', panel: () => <CoachCalendar /> },
  { key: 'automations', label: 'Automations', panel: () => <AutomationsPanel /> },
  { key: 'checkins', label: 'Check-in forms', panel: () => <CheckinsPanel /> },
  { key: 'habits', label: 'Habits', panel: () => <HabitsPanel /> },
  { key: 'teams', label: 'Teams', panel: () => <TeamsPanel /> },
  { key: 'combine', label: 'Combine day', panel: () => <CombineEntry /> },
  { key: 'branding', label: 'Your brand', panel: () => <BrandingPanel /> },
  { key: 'reviews', label: 'Reviews', panel: () => <CoachReviewsPanel /> },
];

export function SetupScreen({ open = null }: { open?: string | null }) {
  // a panel mounts when its row opens (each one reads its own route; nine at once would be nine fetches for nothing)
  const [shown, setShown] = useState<Set<string>>(new Set(open ? [open] : []));
  return (
    <div data-coach-setup>
      {ROWS.map((r) => (
        <details key={r.key} open={open === r.key} className="group border-b border-white/[0.06]" data-setup-row={r.key}
          onToggle={(e) => { const isOpen = (e.currentTarget as HTMLDetailsElement).open; setShown((s) => { const n = new Set(s); if (isOpen) n.add(r.key); else n.delete(r.key); return n; }); }}>
          <summary className={`${LOOK.row} cursor-pointer list-none border-b-0 [&::-webkit-details-marker]:hidden`}>
            <span>{r.label}</span><ChevronRight className="h-5 w-5 text-fel-dim transition-transform group-open:rotate-90" aria-hidden />
          </summary>
          <div className="pb-4">{shown.has(r.key) ? r.panel() : null}</div>
        </details>
      ))}
      <Link href="/coach/velocity" className={LOOK.row} data-coach-velocity-door><span>Bar speed</span><ChevronRight className="h-5 w-5 text-fel-dim" aria-hidden /></Link>
      <Link href="/coach/business" className={LOOK.row} data-team-fee-entry><span>Team fees and packages</span><ChevronRight className="h-5 w-5 text-fel-dim" aria-hidden /></Link>
    </div>
  );
}
