import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getChallenge } from '@/lib/social/challenge-service';
import { challengeVersionLive } from '@/lib/social/challenge-sign';
import { challengePlayHref, challengeReturnPath } from '@/lib/social/challenge-routes';
import { GUEST_HOST_MODES } from '@/lib/social/challenge-guest-play';
import { challengeTitle, displayTag, isChallengeExpired, termsOf } from '@/lib/social/challenge-terms';
import { canonicalModeKey } from '@/lib/game-data';
import { GuestChallengeRun } from '@/components/challenges/guest-challenge-run';

export const dynamic = 'force-dynamic';

/**
 * CHALLENGES-2 — `/c/<code>/play`: a guest plays a friend's challenge with no account (lib/social/challenge-guest-play.ts).
 * Public, like /c/<code>. A signed-in player goes to the mode's real /play route with the code kept on ?c=, and anything
 * this page does not host (a closed, expired or unknown challenge, a rep challenge, a mode with no guest host) goes back
 * to the invite, which says why.
 */
export default async function ChallengePlayPage({ params }: { params: { code: string } }) {
  const back = challengeReturnPath(params.code);
  const found = await getChallenge(params.code);
  if (!found || !challengeVersionLive(found.payload) || isChallengeExpired(found.payload as { t?: unknown })) redirect(back);
  const terms = termsOf(found.payload as never);
  const session = await getServerSession(authOptions);
  if (session) redirect(challengePlayHref(found.modeKey, found.code) ?? back);
  const key = canonicalModeKey(found.modeKey);
  if (terms.metric || !GUEST_HOST_MODES.includes(key)) redirect(back);
  return (
    <div className="min-h-screen bg-[#050505] pb-10">
      <GuestChallengeRun
        code={found.code} modeKey={key} title={challengeTitle(found.modeKey, terms)} targetScore={found.score} theirName={displayTag(found.tag)}
      />
    </div>
  );
}
