import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { ArenaView } from '@/components/arena-view';

export const dynamic = 'force-dynamic';

/**
 * M14 — Triumph Arena. Skill-based head-to-head duels wagered in virtual Lab
 * Credits (LC). No cash on-ramp exists for LC, so the Arena is a pure
 * skill-competition ladder — entirely separate from the (dark) real-money
 * competition path gated behind REAL_MONEY_COMPETITION.
 */
export default async function ArenaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <main className="mx-auto max-w-[960px] px-4 py-8">
        <div className="flex items-center gap-3">
          <h1 className="fel-heading text-3xl font-bold text-white">
            TRIUMPH <span className="text-[#FF3366]">ARENA</span>
          </h1>
        </div>
        <p className="mt-1 max-w-2xl font-mono text-xs text-white/50">
          Head-to-head skill duels wagered in Lab Credits. Post a stake, match an
          opponent, then play the same seeded challenge. Highest score takes the
          pot &mdash; ties are refunded in full.
        </p>
        <ArenaView />
      </main>
      <BottomNav />
    </div>
  );
}
