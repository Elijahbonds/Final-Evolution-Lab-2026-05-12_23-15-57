import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { currentUserId } from '@/lib/camp/server';
import { playerAcceptStep, type PlayerAcceptStep } from '@/lib/consent/guardianAccept';
import { guardianConsentAsk } from '@/lib/consent/guardianGate';
import { AcceptButton } from './accept-button';
import { PlayerRequest } from './player-request';

export const dynamic = 'force-dynamic';

/**
 * WHERE A GUARDIAN CONSENT LINK LANDS (MIRROR-COACH P5, 2026-09-29).
 *
 * An athlete under 18 (or with no birth year on file) shares this link with a parent or guardian from their own
 * phone — FEL never emails it (app/play/mirror/_components/guardian-consent-gate.tsx). This page only READS the
 * request for display; the actual accept is a click (accept-button.tsx), which calls the existing, reused
 * /api/v1/camp/consent — the write this phase's PHASE-5 CONTRACT says to reuse, not duplicate.
 *
 * MIRROR-COACH P6 (2026-09-29): TWO KINDS OF LINK LAND HERE NOW, and they are confirmed differently.
 *   · A request the ATHLETE made for themselves (GuardianConsent.selfRequested) — the link the minor holds. The
 *     person confirming signs in to their OWN FEL account (free), which must not be the athlete's and must carry an
 *     adult birth year; the route enforces that (app/api/v1/camp/consent, lib/consent/guardianAccept.ts), and this
 *     page asks the SAME function what to show first (player-request.tsx), so it never offers a button the route would
 *     refuse. A signed-out tap used to be enough, which meant the minor signing out was enough.
 *   · A request a FACILITATOR made (coach-managed camp) — unchanged: no login, the token is the credential, and the
 *     page reads exactly as it did in P5.
 * Still no write on render: a link-preview crawler loading this page changes nothing (accept-button.tsx's header).
 *
 * MIRROR-COACH P6 FIX (2026-09-29, code review): the ask names everything the yes covers, the optional daily check-in
 * included (lib/consent/guardianGate.ts GUARDIAN_CONSENT_COVERS) — it said "the Mirror or a pain check-in … That's all
 * this does" while P6's readiness check-in rode on the same consent.
 * OWNER DECISION 2026-10-06 ("Match today"): the list now names only what the yes unlocks today — a camp plan going
 * live — since a guardian's OK no longer opens the Mirror or any check-in (see GUARDIAN_CONSENT_COVERS). Copy only.
 */
export default async function GuardianAcceptPage({ params }: { params: { token: string } }) {
  const token = String(params?.token ?? '');
  const consent = await prisma.guardianConsent.findUnique({
    where: { token },
    select: {
      guardianName: true, acceptedAt: true, revokedAt: true, requestedAt: true, menteeId: true, selfRequested: true,
      mentee: { select: { name: true, email: true } },
    },
  });
  if (!consent) notFound();

  const menteeName = consent.mentee?.name || consent.mentee?.email || 'this FEL athlete';

  // Only a pending PLAYER request needs to know who is looking; a camp link and a finished request read as before.
  let step: PlayerAcceptStep | null = null;
  if (!consent.revokedAt && !consent.acceptedAt && consent.selfRequested) {
    const callerId = await currentUserId();
    const caller = callerId ? await prisma.user.findUnique({ where: { id: callerId }, select: { dobYear: true } }) : null;
    step = playerAcceptStep({ menteeId: consent.menteeId, callerId: caller ? callerId : null, callerDobYear: caller?.dobYear ?? null });
  }

  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">Guardian consent</p>
      {consent.revokedAt ? (
        <>
          <h1 className="fel-heading mt-3 text-2xl font-bold text-white">This request was withdrawn</h1>
          <p className="mt-3 max-w-sm text-sm text-white/55">Ask {menteeName} to send a fresh link if this is still needed.</p>
        </>
      ) : consent.acceptedAt ? (
        <>
          <h1 className="fel-heading mt-3 text-2xl font-bold text-white">Already confirmed</h1>
          <p className="mt-3 max-w-sm text-sm text-white/55">
            You (or someone with this link) already said yes, on {new Date(consent.acceptedAt).toLocaleDateString()}. Nothing else to do.
          </p>
        </>
      ) : step ? (
        <PlayerRequest step={step} token={token} menteeName={menteeName} />
      ) : (
        <>
          <h1 className="fel-heading mt-3 text-3xl font-bold text-white">
            {menteeName} <span className="text-white/50">wants your OK</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            {guardianConsentAsk(menteeName)} That&apos;s all this does — it doesn&apos;t create an account for you, and
            FEL never contacts you about anything else.
          </p>
          <AcceptButton token={token} />
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
