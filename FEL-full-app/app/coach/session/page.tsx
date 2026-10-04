import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canSaveScanNumbers, readDobYear } from '@/lib/privacy/scanSaveGate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { SessionHome } from './_components/session-home';

export const dynamic = 'force-dynamic';

export default async function CoachSessionPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/login?next=${encodeURIComponent('/coach/session')}`);
  const userId = (session.user as { id?: string } | undefined)?.id;
  const serverVerified = userId ? verifiedAdult(await readDobYear(prisma, userId, 'coach_session_page')) : false;
  const optedIn = userId ? await canSaveScanNumbers(prisma, userId) : false;
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <SessionHome serverVerified={serverVerified} optedIn={optedIn} />
    </div>
  );
}
