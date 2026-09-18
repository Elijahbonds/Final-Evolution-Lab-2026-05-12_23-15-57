import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { MetricsDashboard } from '@/components/metrics-dashboard';

export const dynamic = 'force-dynamic';

/**
 * M13 Step 5 — admin metrics dashboard. Server-guards on role==='admin'.
 * All numbers are first-party, computed from our own AnalyticsEvent /
 * GameSession / User tables (see lib/metrics-rollup.ts). No third parties.
 */
export default async function AdminMetricsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session.user as any)?.role;
  if (role !== 'admin') redirect('/');

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <main className="mx-auto max-w-[1100px] px-4 py-8">
        <h1 className="fel-heading text-3xl font-bold text-white">
          GROWTH <span className="text-[#00E5FF] fel-glow-cyan">METRICS</span>
        </h1>
        <p className="mt-1 font-mono text-xs text-white/50">
          First-party analytics — retention, virality &amp; conversion. Updated on demand.
        </p>
        <MetricsDashboard />
      </main>
      <BottomNav />
    </div>
  );
}
