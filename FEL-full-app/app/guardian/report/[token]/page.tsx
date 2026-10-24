import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { resolveGuardianReport } from '@/lib/coach/guardianReportServer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Training report', robots: { index: false, follow: false } };

/**
 * /guardian/report/[token] — a teen's training report, for the guardian who said yes (coach-loop P1, 2026-10-20).
 * No account: the signed link is the access; resolveGuardianReport re-checks the consent on every open.
 */
export default async function GuardianReportPage({ params }: { params: { token: string } }) {
  const report = await resolveGuardianReport(prisma, decodeURIComponent(String(params?.token ?? '')));
  if (!report) notFound();
  const last = report.lastSessionDaysAgo == null ? 'No coached session yet' : report.lastSessionDaysAgo === 0 ? 'Today' : `${report.lastSessionDaysAgo} day${report.lastSessionDaysAgo === 1 ? '' : 's'} ago`;
  return (
    <div className="min-h-screen bg-[#050505] px-4 py-10 text-white sm:px-6">
      <main className="mx-auto max-w-lg">
        <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">Training report · {report.asOf}</p>
        <h1 className="fel-heading mt-2 text-2xl font-bold">{report.athlete}&apos;s training</h1>
        {report.coaches.length > 0 && <p className="mt-1 text-sm text-white/55">Coached by {report.coaches.join(', ')}</p>}
        <dl className="mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-4" data-guardian-report>
          <Stat label="Sessions, 7 days" value={String(report.sessionsLast7)} />
          <Stat label="Sessions, 4 weeks" value={String(report.sessionsLast28)} />
          <Stat label="Sets, 7 days" value={String(report.setsLast7)} />
          <Stat label="Last session" value={last} />
        </dl>
        {report.programs.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[11px] uppercase tracking-wider text-white/40">Programs</h2>
            <ul className="mt-2 space-y-2">
              {report.programs.map((p, i) => (
                <li key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 break-words text-sm">{p.name}</span>
                    <span className="shrink-0 text-xs text-white/50">{p.active ? 'current' : 'finished'}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-1.5 rounded-full bg-[#00E5FF]" style={{ width: `${p.planned ? Math.round((p.done / p.planned) * 100) : 0}%` }} /></div>
                  <div className="mt-1 text-xs text-white/50">{p.done} of {p.planned} sessions done</div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="mt-8 text-xs text-white/40">This page shows training only: sessions and sets done. It works for a short time and stops if the consent is withdrawn.</p>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <dt className="text-[10px] uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="mt-1 text-lg font-bold">{value}</dd>
    </div>
  );
}
