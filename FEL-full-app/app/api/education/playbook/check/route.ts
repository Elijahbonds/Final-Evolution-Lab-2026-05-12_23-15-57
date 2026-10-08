export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { grantServerReward } from '@/lib/wallet/wallet-service';
import { rateLimit } from '@/lib/rate-limit';
import { readDobYear, verifiedAdult, type GateDb } from '@/lib/privacy/scanSaveGate';
import { draftsOn } from '@/lib/education/chapterCheck';
import { prismaRewardDeps } from '@/lib/education/rewards';
import { checkGet, checkPost, type CheckDb, type CheckDeps } from '@/lib/education/server/checkRoutes';

/**
 * The Playbook chapter check (EDU-LINKS, 2026-10-07; owner decision 6: chapter shards for a check passed at 80%).
 * GET ?chapter=n — the questions, without answers. POST { chapter, answers } — graded HERE, kept and paid for a verified
 * adult only. The logic and its tests: lib/education/server/checkRoutes.ts.
 */

/** Ten attempts a minute per account: enough to retry, not enough to brute-force four options by script. */
const ATTEMPTS = { limit: 10, windowMs: 60_000 };

function deps(): CheckDeps {
  return {
    db: prisma as unknown as CheckDb,
    rewards: prismaRewardDeps(prisma, (a) => grantServerReward(prisma, a)),
    isAdult: async (id) => verifiedAdult(await readDobYear(prisma as unknown as GateDb, id, 'playbook_check')),
    drafts: draftsOn(),
  };
}

async function userIdOf(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const out = await checkGet(deps(), userId, req.nextUrl.searchParams.get('chapter'));
  return NextResponse.json(out.body, { status: out.status });
}

export async function POST(req: NextRequest) {
  const userId = await userIdOf();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rl = rateLimit(`playbook-check:${userId}`, ATTEMPTS.limit, ATTEMPTS.windowMs);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const out = await checkPost(deps(), userId, body);
  return NextResponse.json(out.body, { status: out.status });
}
