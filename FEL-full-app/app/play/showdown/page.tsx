import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// RETIRED from the v1 roster (owner decision, 2026-09-01): the combat family
// is exactly three modes — Karate VS (the Storm mode), Karate Endless (wave
// survival), Mixed Combat (Soul Calibur). See PHASE2_BENCHMARK_LOCKS.md
// post-lock retirements. The route redirects rather than 404ing on old
// links; the mode file remains in the registry for a future revival.
export default async function RetiredCombatPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  redirect('/modes');
}
