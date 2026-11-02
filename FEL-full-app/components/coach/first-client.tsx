'use client';
// FirstClientChecklist — COACH-DELIVERY (round 8, coordinator item b; 2026-10-27): a coach with nobody on their roster gets a
// "first client" checklist on /coach → Clients, above the invite panel: invite one athlete, start their program from a
// template, run the first session. The steps are the first-run lane's (lane/first-run lib/onboarding/coachFirstRun.ts
// COACH_STEPS, PR #459, NOT landed when this was written): when it lands, this list should become that one (same ids).
// DRAFT copy. Nothing is stored: the invite step is done when the coach has an open invite (the server's list).
import { Check } from 'lucide-react';

export interface FirstClientState { invited: boolean }

const STEPS = [
  { id: 'invite', title: 'Invite your first client', line: 'Make one invite link or code below and send it to one athlete.', href: '#coach-invite' },
  { id: 'template', title: 'Start their program from a template', line: 'When they join, open their program here and pick a starting template instead of an empty week.', href: null },
  { id: 'session', title: 'Run your first session', line: 'Live together, or a guided session on their phone. Their reps come back to you.', href: '/coach/session' },
] as const;

export function firstClientDone(s: FirstClientState): Set<string> {
  return new Set(s.invited ? ['invite'] : []);
}

export function FirstClientChecklist({ state }: { state: FirstClientState }) {
  const done = firstClientDone(state);
  return (
    <section className="fel-card min-w-0 space-y-2 rounded-xl p-4" data-first-client>
      <h2 className="fel-heading text-sm font-bold uppercase tracking-wide text-white">Your first client</h2>
      <ol className="space-y-2">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex min-w-0 gap-2 text-sm" data-first-client-step={s.id} data-done={done.has(s.id) ? 'true' : undefined}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${done.has(s.id) ? 'border-[#00FF9D] bg-[#00FF9D]/15 text-[#00FF9D]' : 'border-white/25 text-white/60'}`}>{done.has(s.id) ? <Check className="h-3 w-3" /> : i + 1}</span>
            <span className="min-w-0">
              <span className="block text-white">{s.title}</span>
              <span className="block text-xs text-white/55">{s.line}{s.href ? <> <a href={s.href} className="text-[#00E5FF] underline">{s.id === 'invite' ? 'Invite now' : 'Sessions'}</a></> : null}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
