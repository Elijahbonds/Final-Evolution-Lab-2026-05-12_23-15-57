import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { ReportsBoard } from './_components/reports-board';

export const dynamic = 'force-dynamic';

/**
 * SAFETY lane (SAF-05, 2026-10-25): the moderation queue. Open reports (newest first) with dismiss / warn / mute / ban,
 * and open appeals (oldest first) with uphold / lift. role 'admin' only; every action is re-checked by
 * /api/report/admin and written to ModerationAudit. A report's reporter is never shown here either: the queue is about
 * what was reported, not who reported it.
 */
export default async function AdminReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/admin/reports'));
  if ((session.user as { role?: string } | undefined)?.role !== 'admin') redirect('/');
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <main className="mx-auto max-w-[1100px] px-4 py-8">
        <h1 className="fel-heading text-3xl font-bold text-white">REPORTS <span className="text-[#FF3366]">QUEUE</span></h1>
        <p className="mt-1 font-mono text-xs text-white/50">Reports about people, and appeals. Every decision is audited and can be appealed once.</p>
        <ReportsBoard />
      </main>
    </div>
  );
}
