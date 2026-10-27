'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, BookOpen, Video, CalendarCheck, Users, Send } from 'lucide-react';
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
    <main className="mx-auto max-w-[900px] px-4 py-4">
      <Link href="/coach/session" className="mb-4 flex min-h-12 items-center justify-center rounded-xl bg-[#FF2D95] px-4 text-base font-bold text-black">
        Court session
      </Link>
      {/* COACH-BUSINESS: the coach's page, packages, payments and applications */}
      {coach ? <Link href="/coach/business" className="mb-4 flex min-h-11 items-center justify-center rounded-xl border border-cyan-300/50 px-4 text-sm font-bold text-cyan-200">Your coaching business</Link> : null}
      {coach && emptyRoster && tab !== 'clients' ? (
        <button type="button" onClick={() => setTab('clients')} className="mb-4 flex min-h-11 w-full items-center justify-center rounded-xl border border-[#00FF9D]/50 px-4 text-sm font-bold text-[#00FF9D]" data-first-client-link>Add your first client →</button>
      ) : null}
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-[#0f0f13] p-1 mb-4 border border-white/6">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              // COACH-LOOP P1 (2026-10-20): on a phone the icon sits over the label, so five tabs fit 390 px without
              // squeezing "Form Check" onto two lines beside a crushed icon (measured: scripts/probes/_coach-phone-probe.mts)
              className={`min-w-0 flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-lg py-2 sm:py-2.5 text-[11px] leading-tight sm:text-sm font-medium transition-all ${
                active
                  ? 'bg-fel-cyan/15 text-fel-cyan shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                  : 'text-fel-dim hover:text-white/70'
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
