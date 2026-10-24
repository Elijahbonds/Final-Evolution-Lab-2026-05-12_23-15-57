/**
 * app/api/challenge/[code]/attempt/route.ts
 * =========================================
 * M13 Step 4 — resolve a guest or authed attempt against a challenge. Bumps
 * the viral funnel counters, emits telemetry, and on a win mints the rematch
 * link back (the K-factor loop). No PII required to attempt.
 *
 * CHALLENGES-2 (2026-10-24):
 *   · 410 `expired` after the challenge's 48 hours (lib/social/challenge-terms.ts).
 *   · The answer carries both scores, won / lost / tie and a signed receipt (lib/social/challenge-receipt.ts): the
 *     result card and the one-tap rematch read it.
 *   · An adult guest's result is kept on their GuestSession row, which signup already migrates into the new account
 *     (lib/social/challenge-guest.ts): "sign up to save" carries it over. No guest row (a teen, a blocked browser, a
 *     guest who has not answered the year) = nothing kept, as before.
 *   · A rep challenge is settled from the attempter's own saved Mirror number, measured after the challenge was sent
 *     (lib/social/challenge-rep.ts); a score in the body is ignored. Adults who opted in to saving numbers only.
 *   · A signed-in winner's rematch link shows no name (the mint route's name rule, challenge-identity.ts); the
 *     client's `attemptTag` is validated and ignored.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { CHALLENGE_EXPIRED, resolveAttempt, verifiedChallenge } from '@/lib/social/challenge-service';
import { guestIdFrom } from '@/lib/guestSession';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';
import { ANON_TAG, challengeExpiresAt, isChallengeExpired, termsOf, REP_METRICS } from '@/lib/social/challenge-terms';
import { recordGuestResult, type GuestDataDb } from '@/lib/social/challenge-guest';
import { measuredRepScore, type RepDb } from '@/lib/social/challenge-rep';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  // a rep challenge's score is the server's reading, so it may be left out
  attemptScore: z.number().finite().optional(),
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

  const found = await verifiedChallenge(params.code);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const now = Date.now();
  if (isChallengeExpired(found.payload, now)) return NextResponse.json({ error: 'expired' }, { status: 410 });

  let attemptScore = parsed.data.attemptScore;
  const terms = termsOf(found.payload);
  if (terms.metric) {
    // measured, never typed: the attempter's best saved reading since the challenge was sent
    if (!userId) return NextResponse.json({ error: 'scan_save_adults_only' }, { status: 403 });
    const until = new Date(Math.min(now + 1, challengeExpiresAt(found.payload) ?? now + 1));
    const read = await measuredRepScore(prisma as unknown as RepDb, userId, terms.metric, new Date(found.payload.t), until);
    if (!read.ok) {
      if (read.error === 'measure_first') return NextResponse.json({ error: 'measure_first', href: REP_METRICS[terms.metric].measureHref }, { status: 409 });
      return NextResponse.json({ error: read.error === 'adults_only' ? 'scan_save_adults_only' : 'metric_closed' }, { status: 403 });
    }
    attemptScore = read.score;
  }
  if (attemptScore === undefined) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const result = await resolveAttempt({
    code: params.code,
    attemptScore: Math.round(attemptScore),
    attemptTag: ANON_TAG,
    userId,
    guestId,
    now,
  });

  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (result === CHALLENGE_EXPIRED) return NextResponse.json({ error: 'expired' }, { status: 410 });

  // an adult guest's result rides on their guest row into the account they sign up as
  if (!userId && guestId) {
    await recordGuestResult(prisma as unknown as GuestDataDb, guestId, {
      code: params.code, modeKey: result.modeKey, score: result.attemptScore, target: result.targetScore, at: now,
    });
  }
  return NextResponse.json(result);
}
