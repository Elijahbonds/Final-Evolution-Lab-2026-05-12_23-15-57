'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, BookOpen, Video, CalendarCheck, Dumbbell } from 'lucide-react';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { TYPE } from '@/lib/design/type';
import { CoachChat } from './coach-chat';
import { useAiStatus } from '@/lib/abacus/useAiStatus';
import { ExerciseCatalogue } from './exercise-catalogue';
import { FormFeedback } from './form-feedback';
import { TodayView } from './today-view';
import { ClientsView } from './clients-view';
import { LOOK } from '@/components/coach/coach-queue/look';
import type { SharedBy } from '@/lib/share/shareable';

// lane 1 (SPEC-PASSION-PIPELINES): Today = the client's session loop; Clients = the certified coach's builder + inbox.
// PLATFORM PHASE 5 (2026-10-27): a COACH no longer gets six tabs. /coach is their home — "Needs you today", the roster's
// week, and their tools under it (app/coach/_components/clients-view.tsx). A CLIENT never sees a coach tab: their /coach
// is their Today, with Exercises, Form Check and the AI coach beside it (phase 6 rebuilds it). Which one is decided by
// what the server says about the account, as before: a certified coach, or a coach of programs.
const TABS = [
  { key: 'today', label: 'Today', icon: CalendarCheck },
  { key: 'chat', label: 'Coach', icon: MessageSquare },
  { key: 'catalogue', label: 'Exercises', icon: BookOpen },
  { key: 'form', label: 'Form Check', icon: Video },
] as const;

type Tab = typeof TABS[number]['key'];

export function CoachView() {
  const [tab, setTab] = useState<Tab>('today');
  const [coach, setCoach] = useState(false);   // the coach home shows only for a certified coach or an existing coach of programs
  const [me, setMe] = useState<SharedBy | null>(null);
  useEffect(() => { fetch('/api/coach/programs').then((r) => r.json()).then((j) => setCoach(!!j.coachCertified || (j.programs ?? []).some((p: { role: string }) => p.role === 'coach'))).catch(() => {}); }, []);
  // the compose screen's live preview must stamp the same "· Certified" the server will, so the identity
  // comes from the server rather than being assembled in the browser
  useEffect(() => { fetch('/api/share/me').then((r) => r.ok ? r.json() : null).then((j) => j && setMe(j)).catch(() => {}); }, []);
  // NP-1: the Coach (AI chat) tab only exists while the AI coach is available; otherwise it is removed, not labelled.
  const [coachAi] = useAiStatus('coach');
  const chatOn = coachAi === 'available';
  const tabs = TABS.filter((t) => t.key !== 'chat' || chatOn);

  if (coach) {
    return (
      <main className={LOOK.page} data-coach-home>
        <ClientsView me={me} chatOn={chatOn} />
      </main>
    );
  }

  return (
    <main className="fel-fade mx-auto max-w-[900px] px-5 pb-28 pt-8 md:pb-10">
      {/* PREMIUM-UI P8 (2026-10-27): the page says where you are (it was a screen-reader-only heading), Court session is the
          ONE primary — the one-accent pill, docked on a phone (was a fourth accent, pink) */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className={`${TYPE.label} text-fel-cyan`}>Train</p>
          <h1 className={`${TYPE.title} text-white`}>Coach</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryCta href="/coach/session" docked icon={<Dumbbell aria-hidden className="h-5 w-5" />}>Court session</PrimaryCta>
        </div>
      </header>
      {/* Tab switcher: the kit's segmented look (a soft white pill on the lit tab; the accent stays for the action) */}
      <div className="mb-5 flex gap-1 rounded-full border border-[color:var(--fel-hairline)] bg-white/[0.03] p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              // COACH-LOOP P1 (2026-10-20): on a phone the icon sits over the label, so the tabs fit 390 px without
              // squeezing "Form Check" onto two lines beside a crushed icon (measured: scripts/probes/_coach-phone-probe.mts)
              className={`fel-press min-w-0 flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-full py-2 sm:py-2.5 text-[12px] font-semibold leading-tight sm:text-[14px] ${
                active
                  ? 'bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                  : 'text-fel-dim hover:text-white/80'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="max-w-full truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'today' && <TodayView />}
      {tab === 'chat' && chatOn && <CoachChat />}
      {tab === 'catalogue' && <ExerciseCatalogue coach={false} />}
      {tab === 'form' && <FormFeedback />}
    </main>
  );
}
