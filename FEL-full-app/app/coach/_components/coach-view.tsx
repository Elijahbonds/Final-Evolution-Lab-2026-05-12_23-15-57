'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, BookOpen, Video, CalendarCheck, Users, Send } from 'lucide-react';
import { CoachChat } from './coach-chat';
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
  // the compose screen's live preview must stamp the same "· Certified" the server will, so the identity
  // comes from the server rather than being assembled in the browser
  useEffect(() => { fetch('/api/share/me').then((r) => r.ok ? r.json() : null).then((j) => j && setMe(j)).catch(() => {}); }, []);
  const tabs = TABS.filter((t) => !COACH_ONLY.includes(t.key) || coach);

  return (
    <main className="mx-auto max-w-[900px] px-4 py-4">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-[#0f0f13] p-1 mb-4 border border-white/6">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${
                active
                  ? 'bg-[#00E5FF]/15 text-[#00E5FF] shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'today' && <TodayView />}
      {tab === 'clients' && <ClientsView />}
      {tab === 'send' && (me
        ? <SendView me={me} />
        : <div className="py-16 text-center text-sm text-white/40">Loading your details…</div>)}
      {tab === 'chat' && <CoachChat />}
      {tab === 'catalogue' && <ExerciseCatalogue />}
      {tab === 'form' && <FormFeedback />}
    </main>
  );
}
