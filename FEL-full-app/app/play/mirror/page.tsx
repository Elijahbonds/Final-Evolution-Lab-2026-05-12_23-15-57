import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { youthGateFor } from '@/lib/mirror/screenCorrectives';
import { MirrorHarness } from './_components/mirror-harness';

export const dynamic = 'force-dynamic';

// Neuro-Mechanic Mirror (v1). Client-side biomechanical coaching overlay gated to
// a single movement pattern (split-stance press/row). Camera + pose run entirely
// in the browser; nothing is uploaded. See lib/babylon/nexus/neuro-mirror/.
export default async function MirrorPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // YOUTH RULES (MIRROR-COACH P3 review, 2026-09-26; PLAN item 9, owner decisions #6, #20): the screen's written
  // corrective blocks are off under 18 or with no birth year on file. A read that fails is no birth year — youth rules.
  const userId = (session.user as { id?: string } | undefined)?.id;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null)
    : null;
  // Standard chrome — a menu screen with no header/nav is a dead end.
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <MirrorHarness youth={youthGateFor(user?.dobYear)} />
    </div>
  );
}
