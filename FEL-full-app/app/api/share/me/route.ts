export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { certificationStatusFor } from '@/lib/camp/certification';

/**
 * GET /api/share/me — who the compose screen says a share is from.
 *
 * The compose screen builds a live preview locally, and that preview has to show the same "· Certified" the
 * server will actually stamp. So the flag comes from here rather than being guessed client-side: it is a
 * claim about a professional, derived from passed credentials on the CURRENT curriculum, minus a revoke.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [user, creds, fac] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } }),
    prisma.credential.findMany({ where: { userId: session.user.id } }),
    prisma.facilitatorProfile.findUnique({ where: { userId: session.user.id }, select: { revokedAt: true } }),
  ]);

  return NextResponse.json({
    coachId: session.user.id,
    displayName: (user?.name ?? 'Coach').slice(0, 60),
    credentialed: certificationStatusFor(creds, fac?.revokedAt ?? null).status === 'certified',
  });
}
