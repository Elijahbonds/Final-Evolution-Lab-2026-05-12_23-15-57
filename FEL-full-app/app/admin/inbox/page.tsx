import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { listProblems, type RawDb } from '@/lib/safety/store';
import { MarkDone } from './_components/mark-done';

export const dynamic = 'force-dynamic';

/**
 * SAFETY lane (SAF-04, 2026-10-25): the "Report a problem" inbox. Each row is what the report carried — route (ids
 * replaced), build, device class, last diagnostic kind, the time, and an adult's screened note — and nothing that names
 * who sent it (there is nothing to show: the row holds no account id, email or address). role 'admin' only.
 */
export default async function AdminInboxPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/admin/inbox'));
  if ((session.user as { role?: string } | undefined)?.role !== 'admin') redirect('/');
  const rows = await listProblems(prisma as unknown as RawDb, 100);
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <main className="mx-auto max-w-[1100px] px-4 py-8">
        <h1 className="fel-heading text-3xl font-bold text-white">PROBLEM <span className="text-[#00E5FF]">INBOX</span></h1>
        <p className="mt-1 font-mono text-xs text-white/50">From “Report a problem”. No account, email or address is ever stored with one.</p>
        {rows === null ? (
          <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60" data-testid="inbox-not-ready">The inbox table is not set up yet (prisma/pending/2026-10-25-user-reports.sql).</p>
        ) : (
          <ul className="mt-6 space-y-2" data-testid="inbox">
            {rows.map((r) => (
              <li key={r.id} className={`rounded-xl border p-3 ${r.status === 'done' ? 'border-white/5 opacity-50' : 'border-white/10 bg-white/[0.03]'}`} data-testid="inbox-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[12px] text-white">{r.route}</p>
                  <MarkDone id={r.id} done={r.status === 'done'} />
                </div>
                <p className="mt-1 font-mono text-[11px] text-white/50">
                  {r.deviceClass} · build {r.buildId} · diag {r.diagKind ?? 'none'} · {new Date(r.createdAt).toLocaleString()}
                </p>
                {r.text && <p className="mt-1 text-[13px] text-white/75">“{r.text}”</p>}
              </li>
            ))}
            {!rows.length && <li className="text-sm text-white/40">Nothing yet.</li>}
          </ul>
        )}
      </main>
    </div>
  );
}
