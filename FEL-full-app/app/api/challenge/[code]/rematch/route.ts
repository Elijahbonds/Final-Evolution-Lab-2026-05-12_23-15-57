/**
 * app/api/challenge/[code]/rematch/route.ts — CHALLENGES-2: the one-tap rematch.
 *
 * Mints a new challenge from the caller back to whoever sent `code`, on the caller's own result: the score in a receipt
 * this account earned (POST /api/challenge/<code>/attempt answered it), or the result a guest row carried into this
 * account at signup (lib/social/challenge-guest.ts). Never a number the client sends. The new link lives 48 hours and
 * shows both scores on its page.
 *
 * Signed-in only: a guest is offered sign-up to rematch (owner, 2026-10-22: sign-up only to save or to rematch), so a
 * guest gets 401 with the sign-up path that brings them back here.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { mintRematch } from '@/lib/social/challenge-service';
import { verifyReceipt, whoKey } from '@/lib/social/challenge-receipt';
import { carriedResultFor, type GuestDataDb } from '@/lib/social/challenge-guest';
import { challengeTagFor } from '@/lib/social/challenge-identity';
import { challengeSignupHref } from '@/lib/social/challenge-routes';
import { ChallengePayloadError } from '@/lib/social/challenge-sign';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  receipt: z.string().max(600).optional(),
  showName: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) return NextResponse.json({ error: 'signup', href: challengeSignupHref(params.code) }, { status: 401 });

  // the caller's own result on this challenge: a receipt they earned signed in, else a guest result carried over
  let myScore: number | null = null;
  const r = parsed.data.receipt ? verifyReceipt(parsed.data.receipt, params.code) : null;
  if (r && r.w === whoKey('u', userId)) myScore = r.s;
  if (myScore === null) myScore = (await carriedResultFor(prisma as unknown as GuestDataDb, userId, params.code))?.score ?? null;
  if (myScore === null) return NextResponse.json({ error: 'no_result' }, { status: 409 });

  try {
    const minted = await mintRematch({
      userId, code: params.code, myScore, athleteTag: await challengeTagFor(prisma as never, userId, parsed.data.showName === true),
    });
    if (!minted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(minted);
  } catch (e) {
    if (e instanceof ChallengePayloadError) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    throw e;
  }
}
