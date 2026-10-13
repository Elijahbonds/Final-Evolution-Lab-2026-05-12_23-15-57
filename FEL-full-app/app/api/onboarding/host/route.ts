export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { cleanRefCode } from '@/lib/creator/share-link';
import { hostFrom } from '@/lib/onboarding/firstRun';
import { isVerifiedAdult } from '@/lib/coach-store/adult';

/**
 * GET /api/onboarding/host?ref=CODE — who sent this person, and what they want them to play first.
 *
 * Deliberately server-side and deliberately narrow. A referral code is printed on stickers and pasted into
 * messages, so it is effectively public; what must NOT be public is a lookup that turns any code into somebody's
 * account. For a verified-adult host only (CARD-SAFE-1), this returns three things and nothing else: a display name, a signature mode and a hex accent. No id,
 * no email, no stats, no card slug. An unknown code returns `{ host: null }` with a 200, because a stale sticker
 * is an ordinary thing that should quietly fall through to the normal sign-up, not an error the visitor sees.
 */
export async function GET(req: NextRequest) {
  const code = cleanRefCode(req.nextUrl.searchParams.get('ref'));
  if (!code) return NextResponse.json({ host: null });

  try {
    const row = await prisma.referralCode.findUnique({
      where: { code },
      select: { user: { select: { id: true, name: true, creatorCards: { where: { published: true }, orderBy: { updatedAt: 'desc' }, take: 1, select: { displayName: true, mode: true, accent: true } } } } },
    });
    // CARD-SAFE-1 (Cyber): a code is public, so the host's card and name are shown only for a verified adult (server
    // User.dobYear via isVerifiedAdult). A minor, unknown age or missing account gets the generic answer — no card
    // fields and no account-name fallback — the same `{ host: null }` a stale code gets.
    const userId = row?.user?.id;
    if (!userId || !(await isVerifiedAdult(prisma, userId))) return NextResponse.json({ host: hostFrom(null, null) });
    const card = row?.user?.creatorCards?.[0] ?? null;
    return NextResponse.json({ host: hostFrom(card, row?.user?.name ?? null) });
  } catch {
    // The arrival must work whether or not this lookup does.
    return NextResponse.json({ host: null });
  }
}
