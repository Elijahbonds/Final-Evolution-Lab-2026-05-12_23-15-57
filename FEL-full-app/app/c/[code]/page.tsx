import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PublicTopBar, PublicLegalFooter } from '@/components/public-chrome';
import { getChallenge } from '@/lib/social/challenge-service';
import { challengeVersionLive } from '@/lib/social/challenge-sign';
import { ChallengeLanding } from '@/components/challenge-landing';
import type { ChallengeResultCardProps } from '@/components/challenges/challenge-result-card';
import { verifyReceipt, whoKey } from '@/lib/social/challenge-receipt';
import { guestIdFrom } from '@/lib/guestSession';
import { carriedResultFor, type GuestDataDb } from '@/lib/social/challenge-guest';
import { guestPlayHref } from '@/lib/social/challenge-guest-play';
import {
  REP_METRICS, challengeExpiresAt, challengeTitle, displayTag, formatChallengeScore, isChallengeExpired, outcomeOf, termsOf,
} from '@/lib/social/challenge-terms';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export const dynamic = 'force-dynamic';

/** The age-screen block flag on this request, or false outside a request (a test rendering the page). */
function blockedBrowser(): boolean {
  try {
    return !!cookies().get(AGE_BLOCK_COOKIE);
  } catch {
    return false;
  }
}

/** Who a receipt must name for this viewer to call its result theirs (the attempt route's whoKey). */
function viewerKey(userId: string | null): string | null {
  try {
    return userId ? whoKey('u', userId) : whoKey('g', guestIdFrom(cookies()) ?? 'anon');
  } catch {
    return null;
  }
}

/**
 * M13 Step 4 — public challenge landing (`/c/<code>`). Reachable logged-out;
 * opening it starts a GUEST-playable ghost duel. Metadata only — no video, no
 * PII. The open is recorded client-side.
 *
 * CHALLENGES-2 (2026-10-24): the v2 invite. The time left of its 48 hours (then "This challenge ended"), the game or
 * the Mirror number it is on, play first for a guest (lib/social/challenge-guest-play.ts), and the viewer's own result
 * card on top when they have one: `?r=<receipt>` from an attempt, or a guest run that sign-up carried into this account.
 * The challenger's name only when they are an adult who chose to show it (challenge-identity.ts); no face.
 */
export default async function ChallengePage({ params, searchParams }: { params: { code: string }; searchParams?: { r?: string | string[] } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const found = await getChallenge(params.code);
  // CHALLENGE-SIGN-V2: the page renders from the columns without verifying, so a v1 row past the sunset (or an unknown
  // version) gets the same invalid-or-expired copy the attempt route's 404 implies.
  const link = found && challengeVersionLive(found.payload) ? found : null;

  let v2: Parameters<typeof ChallengeLanding>[0] | null = null;
  if (link) {
    const payload = link.payload as { t?: unknown; x?: never };
    const terms = termsOf(payload);
    const fmt = (n: number) => formatChallengeScore(terms, n);
    const title = challengeTitle(link.modeKey, terms);
    const theirName = displayTag(link.tag);
    const expired = isChallengeExpired(payload);

    // the viewer's own result: a receipt on the URL, else (signed in) a guest run carried into this account
    let result: ChallengeResultCardProps | null = null;
    const rawReceipt = typeof searchParams?.r === 'string' ? searchParams.r : null;
    let receipt = null as ReturnType<typeof verifyReceipt>;
    try { receipt = rawReceipt ? verifyReceipt(rawReceipt, link.code) : null; } catch { receipt = null; }
    // someone else's receipt (a forwarded URL) is not this viewer's result
    if (receipt && receipt.w !== viewerKey(userId)) receipt = null;
    const carried = !receipt && userId ? await carriedResultFor(prisma as unknown as GuestDataDb, userId, link.code) : null;
    const mine = receipt ? { s: receipt.s, ts: receipt.ts } : carried ? { s: carried.score, ts: carried.target } : null;
    let adult = false;
    if (userId) {
      try {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } });
        adult = verifiedAdult(u?.dobYear ?? null);
      } catch { adult = false; }
    }
    const blocked = !userId && blockedBrowser();
    if (mine) {
      result = {
        code: link.code, title, outcome: outcomeOf(mine.ts, mine.s), myScore: fmt(mine.s), theirScore: fmt(mine.ts), theirName,
        viewer: userId ? 'signed-in' : blocked ? 'blocked' : 'guest', receipt: receipt ? rawReceipt : null, canShowName: adult,
        playAgainHref: null, carried: !!carried,
      };
    }
    const answers = terms.re ? { scoreText: fmt(terms.re.score) } : null;
    v2 = {
      code: link.code, modeKey: link.modeKey, score: link.score, display: link.display, tag: link.tag, isAuthed: !!session,
      title, scoreText: fmt(link.score), theirName, expiresAt: challengeExpiresAt(payload), expired,
      guestHref: terms.metric ? null : guestPlayHref(link.modeKey, link.code),
      rep: terms.metric ? { measureHref: REP_METRICS[terms.metric].measureHref, measureLabel: REP_METRICS[terms.metric].measureLabel } : null,
      answers, result, blocked,
    };
  }

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      {session ? null : <PublicTopBar />}
      <main className="mx-auto max-w-[640px] px-4 py-10">
        {!v2 ? (
          <div className="fel-panel rounded-xl p-8 text-center">
            <h1 className="fel-heading text-2xl font-bold text-white">Challenge not found</h1>
            <p className="mt-2 text-sm text-white/60">
              This challenge link is invalid or has expired.
            </p>
            <a
              href="/try"
              className="mt-6 inline-block rounded-lg bg-[#00E5FF] px-6 py-3 font-bold text-black transition-transform hover:scale-[1.03]"
            >
              Try a dunk instead
            </a>
          </div>
        ) : (
          <ChallengeLanding {...v2} />
        )}
      </main>
      {session ? null : <PublicLegalFooter />}
    </div>
  );
}
