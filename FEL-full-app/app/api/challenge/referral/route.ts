/**
 * app/api/challenge/referral/route.ts — CHALLENGES-2: settle what referral Lab Credits are owed, for the caller as the
 * invited friend and as the referrer of their friends (lib/social/challenge-referral.ts). Exactly once per friend, safe
 * to call on every page view and from both players at the same moment. Signed-in only; the client names no one.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { checkReferrals, type ReferralDb, type WeekOneResult } from '@/lib/social/challenge-referral';

export const dynamic = 'force-dynamic';

/** What the page is told: no ids of other accounts. */
function view(r: WeekOneResult) {
  if (r.status === 'granted') return { status: r.status, amount: r.amount };
  if (r.status === 'not_yet') return { status: r.status, activeDays: r.activeDays, endsAt: r.endsAt };
  if (r.status === 'missed') return { status: r.status, activeDays: r.activeDays };
  return { status: r.status };
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // (new) a page view calls this once; 10 a minute per account is plenty and keeps a loop from re-reading the week
  const rl = rateLimit(`challenge-referral:${userId}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  const out = await checkReferrals(prisma as unknown as ReferralDb, userId);
  return NextResponse.json({ asFriend: view(out.asFriend), asReferrer: out.asReferrer.map(view) });
}
