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
 *
 * CHALLENGES-2 (2026-10-24): an open no longer STARTS a guest. /try's rule (PRIVACY-CORE 1b) is that the year is asked
 * before any guest row exists, and the challenge's play page now asks it the same way and starts the guest only on an
 * adult answer (POST /api/guest). The open is counted with the guest id this browser already has, or none. An open
 * after the challenge's 48 hours is counted and answered `expired: true`.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { markOpened } from '@/lib/social/challenge-service';
import { guestIdFrom } from '@/lib/guestSession';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';
import { challengeExpiresAt, isChallengeExpired } from '@/lib/social/challenge-terms';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id ?? null;

  const jar = cookies();
  const guestId = userId || jar.get(AGE_BLOCK_COOKIE) ? null : guestIdFrom(jar);

  const link = await markOpened(params.code, guestId, userId);
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    code: link.code,
    modeKey: link.modeKey,
    score: link.score,
    display: link.display,
    tag: link.tag,
    expiresAt: challengeExpiresAt(link.payload as { t?: unknown }),
    expired: isChallengeExpired(link.payload as { t?: unknown }),
  });
}
