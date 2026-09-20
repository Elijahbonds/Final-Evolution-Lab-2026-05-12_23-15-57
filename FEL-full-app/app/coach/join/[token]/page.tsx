import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { inviteState, type CoachInvite } from '@/lib/coach/invite';
import { JoinButton } from './join-button';

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
      <Shell>
        <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">Coach invite</p>
        <h1 className="fel-heading mt-3 text-2xl font-bold text-white">
          {state === 'expired' ? 'This invite has expired' : 'This invite has been used'}
        </h1>
        <p className="mt-3 max-w-sm text-sm text-white/55">Ask your coach for a fresh link — they can make one in a tap.</p>
      </Shell>
    );
  }

  if (me && me === invite.coachId) {
    return (
      <Shell>
        <h1 className="fel-heading text-2xl font-bold text-white">That is your own invite link</h1>
        <p className="mt-3 text-sm text-white/55">Share it with an athlete instead — this is what they will see.</p>
        <Link href="/coach" className="mt-6 inline-flex rounded-xl bg-[#00E5FF] px-5 py-2.5 font-bold text-[#050505]">Back to your roster</Link>
      </Shell>
    );
  }

  const already = me
    ? !!(await prisma.coachClient.findUnique({
        where: { coachId_clientId: { coachId: invite.coachId, clientId: me } }, select: { id: true },
      }))
    : false;

  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">Coach invite</p>
      <h1 className="fel-heading mt-3 text-3xl font-bold text-white">
        {invite.coachName} <span className="text-white/50">wants to coach you</span>
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
        Accept and {invite.coachName} can build your programming, watch your movement screens and send you work.
        You can leave at any time.
      </p>
      {me
        ? <JoinButton token={token} coachName={invite.coachName} already={already} />
        : (
          <>
            <Link
              href={`/signup?next=${encodeURIComponent(`/coach/join/${token}`)}`}
              className="mt-7 inline-flex rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-[#050505] transition-transform hover:scale-[1.02]"
            >
              Make an account and join
            </Link>
            <Link href={`/login?next=${encodeURIComponent(`/coach/join/${token}`)}`} className="mt-3 text-xs text-white/45 underline">
              I already have one
            </Link>
          </>
        )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 text-center">
      <Link href="/" className="fel-heading mb-10 text-lg font-bold text-white">
        FINAL <span className="text-[#00E5FF]">EVOLUTION</span> LAB
      </Link>
      {children}
    </div>
  );
}
