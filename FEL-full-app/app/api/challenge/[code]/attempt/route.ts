/**
 * app/api/challenge/[code]/attempt/route.ts
 * =========================================
 * M13 Step 4 — resolve a guest or authed attempt against a challenge. Bumps
 * the viral funnel counters, emits telemetry, and on a win mints the rematch
 * link back (the K-factor loop). No PII required to attempt.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { resolveAttempt } from '@/lib/social/challenge-service';
import { guestIdFrom } from '@/lib/guestSession';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  attemptScore: z.number().finite(),
  attemptTag: z.string().max(16).optional(),
});

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id ?? null;
  // TIP-GUEST-TOKEN-HASH: the events carry the token's hash; none at all for a browser with the age-block flag.
  const jar = cookies();
  const guestId = userId || jar.get(AGE_BLOCK_COOKIE) ? null : guestIdFrom(jar);

  const result = await resolveAttempt({
    code: params.code,
    attemptScore: Math.round(parsed.data.attemptScore),
    attemptTag: parsed.data.attemptTag,
    userId,
    guestId,
  });

  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(result);
}
