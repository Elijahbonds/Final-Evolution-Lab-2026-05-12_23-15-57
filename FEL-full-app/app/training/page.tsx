import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { TrainingClientView } from '@/components/training/TrainingDashboard';

export const dynamic = 'force-dynamic';

/**
 * THE ATHLETE'S TRAINING SCREEN — and until now it did not exist as a route.
 *
 * `TrainingDashboard` and `ClientSessionView` have been in the tree for a while (they came over in the cowork merge)
 * and were mounted NOWHERE: ~470 lines of the client half of a coaching product, unreachable from the app. The
 * invite I built this morning sent every athlete who accepted it to /training, which 404'd — a coach's first
 * impression of the feature would have been their client landing on a dead page.
 *
 * A client with no coach yet gets told how to get one rather than an empty screen, because "no programming" is the
 * normal state for somebody who just signed up, not an error.
 */
export default async function TrainingPage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect('/login?next=%2Ftraining');

  const [coachLink, programCount] = await Promise.all([
    prisma.coachClient.findFirst({
      where: { clientId: me, endedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { coach: { select: { name: true } } },
    }),
    prisma.coachingProgram.count({ where: { clientId: me } }),
  ]);

  if (!coachLink && programCount === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">Training</p>
        <h1 className="fel-heading mt-3 text-2xl font-bold text-white">No coach yet</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
          When a coach sends you an invite link, accepting it puts their programming here. Until then, the modes are
          open and everything you play still counts toward your card.
        </p>
        <Link href="/modes" className="mt-7 inline-flex rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-[#050505]">
          Go and train
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505]">
      {coachLink?.coach?.name && (
        <p className="mx-auto max-w-7xl px-4 pt-6 font-mono text-[11px] uppercase tracking-widest text-white/40">
          Programmed by {coachLink.coach.name}
        </p>
      )}
      <TrainingClientView />
    </main>
  );
}
