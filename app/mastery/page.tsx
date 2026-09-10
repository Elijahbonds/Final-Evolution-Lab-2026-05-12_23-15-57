import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { MasteryLadderView } from '@/components/mastery-ladder-view';

export const dynamic = 'force-dynamic';

/**
 * The mastery ladder — the athlete-facing progression surface. MasteryCore has
 * ranked graded sessions since M13, but until now the only thing a player ever
 * saw of it was a badge on the hub and a one-line toast in the post-run recap.
 * This is where you read where you actually stand, per mode: position inside
 * the tier band, which way your form is moving, and what moves it next.
 */
export default async function MasteryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <AppHeader />
      <main className="mx-auto max-w-[900px] px-4 py-8">
        <h1 className="fel-heading text-3xl font-bold text-white">
          MODE <span className="text-[#00E5FF]">MASTERY</span>
        </h1>
        <p className="mt-1 font-mono text-xs text-white/50">
          Graded performance, not hours played. Bronze → Venice Legend, per mode.
        </p>
        <MasteryLadderView />
      </main>
      <BottomNav />
    </div>
  );
}
