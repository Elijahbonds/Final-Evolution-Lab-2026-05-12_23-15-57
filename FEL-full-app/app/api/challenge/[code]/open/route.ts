/**
 * app/api/challenge/[code]/open/route.ts
 * ======================================
 * M13 Step 4 — record that a challenge link was OPENED (top of the viral
 * funnel). Ensures the visitor has an anonymous guest token (no PII) so the
 * open + any downstream attempt/claim can be attributed through the funnel.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { markOpened } from '@/lib/social/challenge-service';
import { recordServerEvent } from '@/lib/analytics-server';
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE } from '@/lib/guest';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id ?? null;

  let guestId: string | null = null;
  const jar = cookies();
  if (!userId) {
    guestId = jar.get(GUEST_COOKIE)?.value ?? null;
    let existing = guestId ? await prisma.guestSession.findUnique({ where: { token: guestId } }) : null;
    if (!existing) {
      guestId = crypto.randomBytes(24).toString('base64url');
      existing = await prisma.guestSession.create({ data: { token: guestId, data: {} } });
      await recordServerEvent({ name: 'guest_start', guestId, props: { via: 'challenge_open' } });
    }
    jar.set(GUEST_COOKIE, guestId!, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
  }

  const link = await markOpened(params.code, guestId, userId);
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    code: link.code,
    modeKey: link.modeKey,
    score: link.score,
    display: link.display,
    tag: link.tag,
  });
}
