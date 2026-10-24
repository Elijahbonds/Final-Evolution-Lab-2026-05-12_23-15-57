import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { carriedResults, type GuestDataDb } from '@/lib/social/challenge-guest';
import { canSaveScanNumbers, type GateDb } from '@/lib/privacy/scanSaveGate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import {
  challengeExpiresAt, challengeTitle, formatChallengeScore, isChallengeExpired, outcomeOf, termsOf, timeLeftLabel,
} from '@/lib/social/challenge-terms';
import { RepChallengeButton } from '@/components/challenges/rep-challenge-button';
import { ReferralPing } from '@/components/challenges/referral-ping';

export const dynamic = 'force-dynamic';

/** Rows the page lists at most. */
const LIST_CAP = 10;

/**
 * CHALLENGES-2 — `/profile/challenges`: the challenges you sent (time left, opened / played / beaten), the results your
 * guest runs carried into this account (each opens its result card, with the one-tap rematch), a jump challenge for
 * adults whose numbers are saved, and the referral credits check. Signed-in only (the /profile wall).
 */
export default async function ChallengesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/profile/challenges'));
  const userId = (session.user as { id?: string } | undefined)?.id ?? '';
  const [sent, carried, user, canRep] = await Promise.all([
    prisma.challengeLink.findMany({
      where: { ownerUserId: userId }, orderBy: { createdAt: 'desc' }, take: LIST_CAP,
      select: { code: true, modeKey: true, score: true, payload: true, opened: true, attempted: true, beaten: true },
    }).catch(() => []),
    carriedResults(prisma as unknown as GuestDataDb, userId),
    prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null),
    canSaveScanNumbers(prisma as unknown as GateDb, userId),
  ]);
  const adult = verifiedAdult(user?.dobYear ?? null);
  const now = Date.now();

  return (
    <main className="mx-auto max-w-[640px] space-y-6 px-4 py-8 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">Friends</div>
        <h1 className="fel-heading text-3xl font-bold text-white">Challenges</h1>
        <p className="mt-1 text-sm text-white/55">Send a score to beat. It stays open for 48 hours.</p>
      </header>
      <ReferralPing />

      <section className="fel-panel space-y-3 rounded-2xl p-5" aria-labelledby="rep-h">
        <h2 id="rep-h" className="fel-heading text-lg font-bold text-white">Challenge a friend on your jump</h2>
        {canRep ? (
          <RepChallengeButton metric="jump" label="SEND MY BEST JUMP" canShowName={adult} />
        ) : (
          <p className="text-sm text-white/55">
            Jump challenges use saved numbers, so they are for adults who turn saving on. Game challenges are for everyone:
            finish a run and tap Challenge on the result.
          </p>
        )}
      </section>

      {carried.length > 0 && (
        <section className="fel-panel rounded-2xl p-5" aria-labelledby="carried-h">
          <h2 id="carried-h" className="fel-heading text-lg font-bold text-white">From your guest runs</h2>
          <ul className="mt-3 divide-y divide-white/10">
            {carried.slice(0, LIST_CAP).map((r) => {
              const o = outcomeOf(r.target, r.score);
              return (
                <li key={r.code} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{challengeTitle(r.modeKey, { metric: null })}</div>
                    <div className="font-mono text-[11px] text-white/50">You {formatChallengeScore({ metric: null }, r.score)} · them {formatChallengeScore({ metric: null }, r.target)} · {o === 'won' ? 'you won' : o === 'tie' ? 'tie' : 'they won'}</div>
                  </div>
                  <Link href={`/c/${encodeURIComponent(r.code)}`} className="shrink-0 rounded-md border border-[#00E5FF]/40 px-3 py-1.5 font-mono text-[11px] text-[#00E5FF]">Rematch</Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="fel-panel rounded-2xl p-5" aria-labelledby="sent-h">
        <h2 id="sent-h" className="fel-heading text-lg font-bold text-white">You sent</h2>
        {sent.length === 0 ? (
          <p className="mt-2 text-sm text-white/55">Nothing yet. Finish a run and tap Challenge on the result.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/10">
            {sent.map((l) => {
              const payload = l.payload as { t?: unknown; x?: never };
              const terms = termsOf(payload);
              const left = isChallengeExpired(payload, now) ? 'Ended' : timeLeftLabel(challengeExpiresAt(payload), now);
              return (
                <li key={l.code} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{challengeTitle(l.modeKey, terms)} · {formatChallengeScore(terms, l.score)}</div>
                    <div className="font-mono text-[11px] text-white/50">{l.opened} opened · {l.attempted} played · {l.beaten} beat it{left ? ` · ${left}` : ''}</div>
                  </div>
                  <Link href={`/c/${encodeURIComponent(l.code)}`} className="shrink-0 font-mono text-[11px] text-white/60 underline-offset-4 hover:underline">Open</Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
