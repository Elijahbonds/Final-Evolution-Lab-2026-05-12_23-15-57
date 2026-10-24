/**
 * app/api/challenge/[code]/open/route.ts
 * ======================================
 * M13 Step 4 — record that a challenge link was OPENED (top of the viral
 * funnel). Ensures the visitor has an anonymous guest token (no PII) so the
 * open + any downstream attempt/claim can be attributed through the funnel.
 *
 * TIP-GUEST-TOKEN-HASH (2026-10-19): the row and the events carry the token's
 * hash (lib/guestSession.ts); a browser with the AGE-SCREEN block flag gets no
 * guest row and no cookie, and the open is counted without a guest id.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { markOpened } from '@/lib/social/challenge-service';
import { recordServerEvent } from '@/lib/analytics-server';
import { hashGuestToken, mintGuestToken } from '@/lib/guest';
import { createGuestSession, findGuestSession, guestTokenFrom, setGuestCookie } from '@/lib/guestSession';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id ?? null;

  let guestId: string | null = null;
  const jar = cookies();
  if (!userId && !jar.get(AGE_BLOCK_COOKIE)) {
    let token = guestTokenFrom(jar)?.token ?? null;
    guestId = token ? hashGuestToken(token) : null;
    const existing = guestId ? await findGuestSession(prisma, guestId) : null;
    if (!existing) {
      token = mintGuestToken();
      guestId = hashGuestToken(token);
      await createGuestSession(prisma, guestId);
      await recordServerEvent({ name: 'guest_start', guestId, props: { via: 'challenge_open' } });
    }
    setGuestCookie(jar, token!);
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
