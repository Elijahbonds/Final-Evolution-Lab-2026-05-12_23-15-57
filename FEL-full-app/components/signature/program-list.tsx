// SIGNATURE-PROGRAMS (2026-10-25): the four programs' cards on /train/programs. The view is lib/signature/server.ts
// programsOverview (approved programs; the admin also sees drafts, labelled). Server-rendered: no script of its own.
import Link from 'next/link';
import { Layers, ShieldCheck } from 'lucide-react';
import type { ProgramCard } from '@/lib/signature/view';
import { DRAFT_BADGE, NONE_APPROVED_LINE, NOT_READY_LINE, YOUTH_DEVICE_LINE, FREE_WEEK_LINE } from '@/lib/signature/copy';

export const programHref = (id: string): string => `/train/programs/${id}`;

export function ProgramList({ ready, admin, youth, programs }: { ready: boolean; admin: boolean; youth: boolean; programs: ProgramCard[] }) {
  return (
    <div data-testid="signature-list" className="mx-auto max-w-[720px]">
      {!ready && <p className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-white/60">{NOT_READY_LINE}</p>}
      {ready && !programs.length && <p className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[13px] text-white/60">{NONE_APPROVED_LINE}</p>}
      {admin && (
        <Link href="/coach/admin/programs" data-review-link className="mb-4 flex min-h-[44px] items-center gap-2 text-[13px] font-bold text-[#FFD700]/85 underline-offset-2 hover:underline">
          <ShieldCheck aria-hidden className="h-4 w-4" /> Review the drafts →
        </Link>
      )}
      <p className="mb-4 text-[12.5px] text-white/50">{youth ? YOUTH_DEVICE_LINE : FREE_WEEK_LINE}</p>
      <ul className="grid gap-3">
        {programs.map((p) => (
          <li key={p.id}>
            <Link href={programHref(p.id)} data-program={p.id} data-status={p.status}
              className="flex gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.045]">
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#00FF9D]/12">
                <Layers className="h-5 w-5 text-[#00FF9D]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                  {p.range.min === p.range.max ? `${p.range.planned} weeks` : `${p.range.planned} weeks (${p.range.min}–${p.range.max})`} · {p.daysPerWeek} days a week
                </span>
                <span className="fel-heading mt-1 block text-[16px] font-bold leading-tight text-white">{p.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-white/60">{p.tagline}</span>
                {p.prehabNote && <span data-prehab-note className="mt-1.5 block text-[12px] font-bold text-amber-200/85">{p.prehabNote}</span>}
                {p.progress && (
                  <span data-progress className="mt-1.5 block text-[12.5px] text-[#00E5FF]">
                    Week {p.progress.week} of {p.progress.of} · {p.progress.sessionsDone} of {p.progress.sessionsTotal} sessions{p.progress.next ? ` · next: ${p.progress.next}` : ''}
                  </span>
                )}
                {p.draft && <span data-draft className="mt-1.5 block text-[11.5px] font-bold text-[#FFD700]/80">{p.status === 'rejected' ? 'Rejected. ' : ''}{DRAFT_BADGE}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One line under the progress card (/profile/week): the active program's week. Not on the share image. */
export function ProgramWeekLine({ card }: { card: ProgramCard | null }) {
  if (!card?.progress) return null;
  const p = card.progress;
  return (
    <Link href={programHref(card.id)} data-testid="program-week-line" data-program={card.id}
      className="mt-3 flex min-h-[44px] items-center gap-3 rounded-2xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.04] px-4 py-2.5 text-[13px] text-white/70 hover:bg-[#00E5FF]/[0.08]">
      <Layers aria-hidden className="h-4 w-4 shrink-0 text-[#00E5FF]" />
      <span className="min-w-0 flex-1">{card.title}: week {p.week} of {p.of}, {p.weekDone} of {p.weekTotal} sessions this week.</span>
      <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#00E5FF]">Program →</span>
    </Link>
  );
}
