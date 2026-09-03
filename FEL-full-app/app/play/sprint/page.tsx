import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// RETIRED from the v1 roster (owner decision, 2026-09-01): no locked benchmark
// and none chosen — see PHASE2_BENCHMARK_LOCKS.md TIER B. The route redirects to /modes (the Lab)
// to the Arena rather than 404ing on old links; the mode file remains in the
// registry for a future revival with a real benchmark.
export default async function SprintPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  redirect('/modes');
}
