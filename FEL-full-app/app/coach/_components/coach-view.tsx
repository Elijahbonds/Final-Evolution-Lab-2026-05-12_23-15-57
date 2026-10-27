'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, BookOpen, Video, CalendarCheck, Users, Send, Dumbbell, Briefcase } from 'lucide-react';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { Chip } from '@/components/ui/fel/chip';
import { TYPE } from '@/lib/design/type';
import { CoachChat } from './coach-chat';
import { useAiStatus } from '@/lib/abacus/useAiStatus';
import { ExerciseCatalogue } from './exercise-catalogue';
import { FormFeedback } from './form-feedback';
import { TodayView } from './today-view';
import { ClientsView } from './clients-view';
import { SendView } from './send-view';
import type { SharedBy } from '@/lib/share/shareable';

// lane 1 (SPEC-PASSION-PIPELINES): Today = the client's session loop; Clients = the certified coach's builder + inbox.
// Send (2026-09-13) = texting programming to a client. Coach-only, like Clients.
const TABS = [
  { key: 'today', label: 'Today', icon: CalendarCheck },
  { key: 'clients', label: 'Clients', icon: Users },
  { key: 'send', label: 'Send', icon: Send },
  { key: 'chat', label: 'Coach', icon: MessageSquare },
  { key: 'catalogue', label: 'Exercises', icon: BookOpen },
  { key: 'form', label: 'Form Check', icon: Video },
] as const;

const COACH_ONLY: readonly string[] = ['clients', 'send'];

type Tab = typeof TABS[number]['key'];

export function CoachView() {
  const [tab, setTab] = useState<Tab>('today');
  const [coach, setCoach] = useState(false);   // the Clients tab shows only for a certified coach or an existing coach of programs
  const [me, setMe] = useState<SharedBy | null>(null);
  useEffect(() => { fetch('/api/coach/programs').then((r) => r.json()).then((j) => setCoach(!!j.coachCertified || (j.programs ?? []).some((p: { role: string }) => p.role === 'coach'))).catch(() => {}); }, []);
  // COACH-DELIVERY (round 8 item b): a coach with nobody on their roster gets a "first client" link to the checklist
  const [emptyRoster, setEmptyRoster] = useState(false);
  useEffect(() => { if (coach) fetch('/api/coach/roster').then((r) => (r.ok ? r.json() : null)).then((j) => setEmptyRoster(Array.isArray(j?.roster) && j.roster.length === 0)).catch(() => {}); }, [coach]);
  // the compose screen's live preview must stamp the same "· Certified" the server will, so the identity
  // comes from the server rather than being assembled in the browser
  useEffect(() => { fetch('/api/share/me').then((r) => r.ok ? r.json() : null).then((j) => j && setMe(j)).catch(() => {}); }, []);
  // NP-1: the Coach (AI chat) tab only exists while the AI coach is available; otherwise it is removed, not labelled.
  const [coachAi] = useAiStatus('coach');
  const chatOn = coachAi === 'available';
  const tabs = TABS.filter((t) => (!COACH_ONLY.includes(t.key) || coach) && (t.key !== 'chat' || chatOn));

  return (
    <main className="fel-fade mx-auto max-w-[900px] px-5 pb-28 pt-8 md:pb-10">
      {/* PREMIUM-UI P8 (2026-10-27): the page says where you are (it was a screen-reader-only heading), Court session is the
          ONE primary — the one-accent pill, docked on a phone (was a fourth accent, pink) — and the business is a quiet door */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className={`${TYPE.label} text-fel-cyan`}>Train</p>
          <h1 className={`${TYPE.title} text-white`}>Coach</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryCta href="/coach/session" docked icon={<Dumbbell aria-hidden className="h-5 w-5" />}>Court session</PrimaryCta>
          {/* COACH-BUSINESS: the coach's page, packages, payments and applications */}
          {coach ? <Chip href="/coach/business" icon={<Briefcase aria-hidden className="h-4 w-4" />}>Your coaching business</Chip> : null}
        </div>
      </header>
      {/* COACH-DELIVERY: a coach with no roster gets one quiet door to the first-client checklist (in the kit's chip look) */}
      {coach && emptyRoster && tab !== 'clients' ? (
        <button type="button" onClick={() => setTab('clients')} className={`fel-press mb-5 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-fel-emerald/40 bg-fel-emerald/[0.1] px-3 text-fel-emerald ${TYPE.label}`} data-first-client-link>Add your first client →</button>
      ) : null}
      {/* Tab switcher: the kit's segmented look (a soft white pill on the lit tab; the accent stays for the action) */}
      <div className="mb-5 flex gap-1 rounded-full border border-[color:var(--fel-hairline)] bg-white/[0.03] p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              // COACH-LOOP P1 (2026-10-20): on a phone the icon sits over the label, so five tabs fit 390 px without
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
      {tab === 'clients' && <ClientsView />}
      {tab === 'send' && (me
        ? <SendView me={me} />
        : <div className="py-16 text-center text-sm text-fel-dim">Loading your details…</div>)}
      {tab === 'chat' && chatOn && <CoachChat />}
      {/* MIRROR-COACH P2: a coach's Exercises tab also holds their prescribable catalogue + "Add to my catalogue" */}
      {tab === 'catalogue' && <ExerciseCatalogue coach={coach} />}
      {tab === 'form' && <FormFeedback />}
    </main>
  );
}
