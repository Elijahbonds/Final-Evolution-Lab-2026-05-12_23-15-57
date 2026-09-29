import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { AcceptButton } from './accept-button';

export const dynamic = 'force-dynamic';

/**
 * WHERE A GUARDIAN CONSENT LINK LANDS (MIRROR-COACH P5, 2026-09-29).
 *
 * An athlete under 18 (or with no birth year on file) shares this link with a parent or guardian from their own
 * phone — FEL never emails it (app/play/mirror/_components/guardian-consent-gate.tsx). This page only READS the
 * request for display; the actual accept is a click (accept-button.tsx), which calls the existing, reused
 * GET /api/v1/camp/consent?token=… — the write this phase's PHASE-5 CONTRACT says to reuse, not duplicate.
 *
 * No login: the token is the credential, same rule the API route itself already states. A guardian may have no FEL
 * account at all, and should not need one to say yes.
 */
export default async function GuardianAcceptPage({ params }: { params: { token: string } }) {
  const token = String(params?.token ?? '');
  const consent = await prisma.guardianConsent.findUnique({
    where: { token },
    select: {
      guardianName: true, acceptedAt: true, revokedAt: true, requestedAt: true,
      mentee: { select: { name: true, email: true } },
    },
  });
  if (!consent) notFound();

  const menteeName = consent.mentee?.name || consent.mentee?.email || 'this FEL athlete';

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
      ) : (
        <>
          <h1 className="fel-heading mt-3 text-3xl font-bold text-white">
            {menteeName} <span className="text-white/50">wants your OK</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            FEL is a training app. Before {menteeName} can use its movement-coaching camera tool (the Mirror) or log
            how an exercise feels (a pain check-in), we ask a parent or guardian to confirm that&apos;s OK. That&apos;s all
            this does — it doesn&apos;t create an account for you, and FEL never contacts you about anything else.
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
