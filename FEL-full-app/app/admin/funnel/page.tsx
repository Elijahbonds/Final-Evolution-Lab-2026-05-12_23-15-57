import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { computeFunnelCounts, STAGE_META, FUNNEL_ORDER } from '@/lib/marketing/funnel';
import { ReengageButton } from '@/components/marketing/reengage-button';

export const dynamic = 'force-dynamic';

/**
 * P4 — admin marketing-funnel view. Server-guards on role==='admin'.
 * Reads MarketingLead rows (first-party) and renders stage counts +
 * conversion rate + the most recent leads. No third parties.
 */
export default async function AdminFunnelPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session.user as any)?.role;
  if (role !== 'admin') redirect('/');

  const rows = await prisma.marketingLead.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, email: true, name: true, source: true, stage: true, createdAt: true, referredByCode: true },
  });
  const counts = computeFunnelCounts(rows.map((r) => ({ stage: r.stage as any })));
  const recent = rows.slice(0, 50);

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <main className="mx-auto max-w-[1100px] px-4 py-8">
        <h1 className="fel-heading text-3xl font-bold text-white">
          MARKETING <span className="text-[#00FF9D]">FUNNEL</span>
        </h1>
        <p className="mt-1 font-mono text-xs text-white/50">
          First-party leads &amp; lifecycle stages. {counts.total} total leads ·{' '}
          {(counts.conversionRate * 100).toFixed(1)}% converted.
        </p>

        <div className="mt-4">
          <ReengageButton />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {FUNNEL_ORDER.map((stage) => {
            const meta = STAGE_META[stage];
            const n = counts.byStage[stage] ?? 0;
            return (
              <div
                key={stage}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                style={{ boxShadow: `inset 0 0 0 1px ${meta.color}22` }}
              >
                <div className="text-3xl font-black" style={{ color: meta.color }}>
                  {n}
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-white/60">
                  {meta.label}
                </div>
                <div className="mt-1 text-[11px] text-white/40">{meta.blurb}</div>
              </div>
            );
          })}
        </div>

        <h2 className="mt-10 fel-heading text-xl font-bold text-white">Recent leads</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] font-mono text-[11px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                    No leads captured yet.
                  </td>
                </tr>
              ) : (
                recent.map((r) => {
                  const meta = STAGE_META[r.stage as keyof typeof STAGE_META] ?? STAGE_META.lead;
                  return (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="px-4 py-3 text-white/80">{r.email}</td>
                      <td className="px-4 py-3 text-white/50">{r.name ?? '\u2014'}</td>
                      <td className="px-4 py-3 text-white/50">{r.source}</td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase"
                          style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/40">{r.referredByCode ?? '\u2014'}</td>
                      <td className="px-4 py-3 text-white/40">
                        {new Date(r.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
