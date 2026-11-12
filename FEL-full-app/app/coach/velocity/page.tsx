import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { CoachVelocity } from '@/components/vbt/coach-velocity';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Bar speed — coach' };

/** VBT (2026-10-25): the coach's bar-speed view — clients' reps and speed loss, a team, and velocity zones on program slots. */
export default async function CoachVelocityPage() {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) redirect(loginPath('/coach/velocity'));
  return (
    <main className="mx-auto min-h-screen max-w-xl bg-[#050505] px-4 py-6 pb-20">
      <CoachVelocity />
    </main>
  );
}
