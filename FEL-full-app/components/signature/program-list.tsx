// SIGNATURE-PROGRAMS (2026-10-25): the four programs' cards on /train/programs. The view is lib/signature/server.ts
// programsOverview (approved programs; the admin also sees drafts, labelled). Server-rendered: no script of its own.
// PLAT-P01 (2026-10-27): one card per program — the weeks, the title, one line (the athlete's place in it once started,
// else the tagline) and a status chip for the admin's drafts. While no program is open, everyone reads the one
// owner-approved line (lib/signature/copy.ts NOT_READY_LINE / NONE_APPROVED_LINE, owner-approvals #469).
import Link from 'next/link';
import { Layers, ShieldCheck } from 'lucide-react';
import type { ProgramCard } from '@/lib/signature/view';
import { DRAFT_BADGE, NONE_APPROVED_LINE, NOT_READY_LINE, YOUTH_DEVICE_LINE, FREE_WEEK_LINE } from '@/lib/signature/copy';
import { Chip } from '@/components/ui/fel/chip';
import { SIG_LOOK } from './look';

export const programHref = (id: string): string => `/train/programs/${id}`;

const chipOf = (p: ProgramCard): string | null => (p.status === 'rejected' ? 'Rejected' : p.draft ? 'Draft' : null);

export function ProgramList({ ready, admin, youth, programs }: { ready: boolean; admin: boolean; youth: boolean; programs: ProgramCard[] }) {
  const closed = !ready || !programs.length;
  return (
    <div data-testid="signature-list" className="mx-auto max-w-[720px]">
      {closed && (
        <p data-closed className={`fel-surface mb-4 rounded-2xl p-4 ${SIG_LOOK.body}`}>
          {!ready ? NOT_READY_LINE : NONE_APPROVED_LINE}
        </p>
      )}
      {admin && (
        <Link href="/coach/admin/programs" data-review-link className="mb-4 flex min-h-[44px] items-center gap-2 text-[13px] font-bold text-[#FFD700]/85 underline-offset-2 hover:underline">
          <ShieldCheck aria-hidden className="h-4 w-4" /> Review the drafts →
        </Link>
      )}
      {programs.length > 0 && <p className={`mb-4 ${SIG_LOOK.body}`}>{youth ? YOUTH_DEVICE_LINE : FREE_WEEK_LINE}</p>}
      <ul className="grid gap-3">
        {programs.map((p) => {
          const chip = chipOf(p);
          return (
            <li key={p.id}>
              <Link href={programHref(p.id)} data-program={p.id} data-status={p.status} className={SIG_LOOK.card}>
                <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#00FF9D]/12">
                  <Layers className="h-5 w-5 text-[#00FF9D]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={SIG_LOOK.meta}>{p.range.planned} weeks</span>
                    {chip && <span data-draft title={DRAFT_BADGE}><Chip tone="warning">{chip}</Chip></span>}
                  </span>
                  <span className={SIG_LOOK.cardTitle}>{p.title}</span>
                  {p.progress
                    ? <span data-progress className={`mt-1 block ${SIG_LOOK.body} text-fel-cyan`}>Week {p.progress.week} of {p.progress.of} · {p.progress.sessionsDone} of {p.progress.sessionsTotal} sessions</span>
                    : <span className={`mt-1 block ${SIG_LOOK.body}`}>{p.tagline}</span>}
                  {p.prehabNote && <span data-prehab-note className="mt-1.5 block text-[12px] font-bold text-amber-200/85">{p.prehabNote}</span>}
                </span>
              </Link>
            </li>
          );
        })}
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
