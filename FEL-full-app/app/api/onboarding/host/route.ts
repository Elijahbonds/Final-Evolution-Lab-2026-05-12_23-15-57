export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cleanRefCode } from '@/lib/creator/share-link';
import { hostFrom } from '@/lib/onboarding/firstRun';

/**
 * GET /api/onboarding/host?ref=CODE — who sent this person, and what they want them to play first.
 *
 * Deliberately server-side and deliberately narrow. A referral code is printed on stickers and pasted into
 * messages, so it is effectively public; what must NOT be public is a lookup that turns any code into somebody's
 * account. This returns three things and nothing else: a display name, a signature mode and a hex accent. No id,
 * no email, no stats, no card slug. An unknown code returns `{ host: null }` with a 200, because a stale sticker
 * is an ordinary thing that should quietly fall through to the normal sign-up, not an error the visitor sees.
 */
export async function GET(req: NextRequest) {
  const code = cleanRefCode(req.nextUrl.searchParams.get('ref'));
  if (!code) return NextResponse.json({ host: null });

  try {
    const row = await prisma.referralCode.findUnique({
      where: { code },
      select: { user: { select: { name: true, creatorCards: { where: { published: true }, orderBy: { updatedAt: 'desc' }, take: 1, select: { displayName: true, mode: true, accent: true } } } } },
    });
    const card = row?.user?.creatorCards?.[0] ?? null;
    return NextResponse.json({ host: hostFrom(card, row?.user?.name ?? null) });
  } catch {
    // The arrival must work whether or not this lookup does.
    return NextResponse.json({ host: null });
  }
}
