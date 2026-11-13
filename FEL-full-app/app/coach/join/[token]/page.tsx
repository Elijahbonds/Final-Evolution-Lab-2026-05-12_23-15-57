import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { inviteState, type CoachInvite } from '@/lib/coach/invite';
import { JoinButton } from './join-button';
import { notice } from '@/lib/every-screen/notices';
import { JOIN_CONSENT_LINE } from '@/lib/coach/inviteCopy';

export const dynamic = 'force-dynamic';

/**
 * WHERE AN INVITE LANDS. A coach shows a QR in a gym or drops a link in a DM; this is the page on the other side.
 *
 * It renders the same for a signed-out stranger and a signed-in athlete, because the first thing either of them needs
 * is the same: whose roster is this, and do I want to be on it. Signing in is a step on the way, not a gate in front
 * of the answer — a link that demands a login before it will say who sent it is a link people close.
 */
export default async function JoinPage({ params }: { params: { token: string } }) {
  const token = String(params?.token ?? '');
  const row = await prisma.coachInvite.findUnique({
    where: { token },
    select: {
      token: true, coachId: true, use: true, closedAt: true, expiresAt: true, joined: true, createdAt: true,
      coach: { select: { name: true } },
    },
  });
  if (!row) notFound();

  const invite: CoachInvite = {
    token: row.token, coachId: row.coachId, coachName: row.coach?.name ?? 'your coach',
    use: row.use === 'many' ? 'many' : 'once',
    createdAtMs: row.createdAt.getTime(), expiresAtMs: row.expiresAt.getTime(),
    closedAtMs: row.closedAt ? row.closedAt.getTime() : undefined, joined: row.joined,
  };
  const state = inviteState(invite, Date.now());
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;

  if (state !== 'open') {
    return (
      <Shell signedIn={!!me}>
        <p className="font-mono text-[12px] uppercase tracking-widest text-fel-dim">Coach invite</p>
        <h1 className="fel-heading mt-3 text-2xl font-bold text-white">
          {state === 'expired' ? 'This invite has expired' : 'This invite has been used'}
        </h1>
        {/* COACH-WORDS (owner 2026-11-12): was "Ask your coach for a fresh link — they can make one in a tap." */}
        <p className="mt-3 max-w-sm text-sm text-white/55">Ask your coach for a fresh link.</p>
      </Shell>
    );
  }

  if (me && me === invite.coachId) {
    return (
      <Shell signedIn={!!me}>
        <h1 className="fel-heading text-2xl font-bold text-white">That is your own invite link</h1>
        <p className="mt-3 text-sm text-white/55">Share it with an athlete instead — this is what they will see.</p>
        <Link href="/coach" className="mt-6 inline-flex rounded-xl bg-fel-cyan px-5 py-2.5 font-bold text-fel-bg">Back to your roster</Link>
      </Shell>
    );
  }

  const already = me
    ? !!(await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: invite.coachId, clientId: me } }, select: { id: true },
      }))
    : false;

  // COACH-WORDS (owner 2026-11-12): the "Coach invite" label above the heading is gone (the heading already says it). The
  // paragraph under it is what the athlete agrees to (what the coach can see and do, and that they can leave): consent
  // wording. Option C, approved by the owner: "your coach" in place of the coach's name, every other word unchanged, and
  // marked as an approved consent notice.
  return (
    <Shell signedIn={!!me}>
      <h1 className="fel-heading text-3xl font-bold text-white">
        {invite.coachName} <span className="text-white/50">wants to coach you</span>
      </h1>
      <p {...notice('consent')} className="mt-4 max-w-sm text-base leading-relaxed text-white/60">{JOIN_CONSENT_LINE}</p>
      {me
        ? <JoinButton token={token} coachName={invite.coachName} already={already} />
        : (
          <>
            <Link
              href={`/signup?next=${encodeURIComponent(`/coach/join/${token}`)}`}
              className="mt-7 inline-flex rounded-xl bg-fel-cyan px-6 py-3 font-bold text-fel-bg transition-transform hover:scale-[1.02]"
            >
              Make an account and join
            </Link>
            <Link href={`/login?next=${encodeURIComponent(`/coach/join/${token}`)}`} className="mt-3 text-xs text-fel-dim underline">
              I already have one
            </Link>
          </>
        )}
    </Shell>
  );
}

/** EVERY-SCREEN P10: signed in, the app's top bar will arrive over this page once the session loads; its place is held
 *  (components/shell/status-rail.tsx's spacer) so the page does not jump down when it does. */
const HOLD_RAIL = '[data-fel-rail-spacer]{height:3.5rem!important}';

function Shell({ children, signedIn = false }: { children: React.ReactNode; signedIn?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-fel-bg px-6 text-center">
      {signedIn && <style>{HOLD_RAIL}</style>}
      <Link href="/" className="fel-heading mb-10 inline-flex min-h-11 items-center text-lg font-bold text-white">
        FINAL <span className="text-fel-cyan">EVOLUTION</span> LAB
      </Link>
      {children}
    </div>
  );
}
