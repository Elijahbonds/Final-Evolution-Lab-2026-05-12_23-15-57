export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, isOwner, recomputeCertification, bad } from '@/lib/camp/server';

/** POST /api/v1/camp/revoke — owner only: { userId, reason } revokes; { userId, reinstate: true } lifts it. */
export async function POST(req: NextRequest) {
  const me = await currentUserId();
  if (!me) return bad('unauthorized', 401);
  if (!(await isOwner(me))) return bad('forbidden', 403);
  let body: { userId?: string; reason?: string; reinstate?: boolean };
  try { body = await req.json(); } catch { return bad('invalid_json'); }
  const userId = String(body.userId ?? '');
  const fac = await prisma.facilitatorProfile.findUnique({ where: { userId } });
  if (!fac) return bad('not_found', 404);
  await prisma.facilitatorProfile.update({
    where: { userId },
    data: body.reinstate ? { revokedAt: null, revokedReason: null } : { revokedAt: new Date(), revokedReason: String(body.reason ?? '').slice(0, 300) || 'revoked by owner' },
  });
  const cert = await recomputeCertification(userId);
  return NextResponse.json({ status: cert.status, revokedAt: cert.profile.revokedAt });
}
