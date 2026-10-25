import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { readWithdrawToken } from '@/lib/consent/withdraw';
import { WithdrawButton } from './withdraw-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * WHERE A GUARDIAN'S WITHDRAW LINK LANDS — SAFETY lane (SAF-01, 2026-10-25).
 *
 * The link comes from the accept page once they said yes, and from the accepted email (lib/consent/acceptedEmail.ts,
 * off until the owner switches it on). This page only READS (a link-preview crawler loading it changes nothing); the
 * withdraw is the button, which POSTs /api/consent/withdraw. No sign-in: the signed link is the credential.
 * It shows the athlete's FIRST name only, and nothing else about anyone. An unsigned or edited link reads the same as
 * one that names no consent.
 */
export default async function WithdrawPage({ params }: { params: { token: string } }) {
  const token = String(params?.token ?? '');
  const consentId = readWithdrawToken(token);
  const row = consentId
    ? await prisma.guardianConsent.findUnique({ where: { id: consentId }, select: { revokedAt: true, acceptedAt: true, mentee: { select: { name: true } } } }).catch(() => null)
    : null;
  const first = row?.mentee?.name?.trim().split(/\s+/)[0] || 'this athlete';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 text-center">
      <Link href="/" className="fel-heading mb-10 text-lg font-bold text-white">
        FINAL <span className="text-[#00E5FF]">EVOLUTION</span> LAB
      </Link>
      <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">Guardian consent</p>
      {!row ? (
        <>
          <h1 className="fel-heading mt-3 text-2xl font-bold text-white">This link doesn&apos;t work</h1>
          <p className="mt-3 max-w-sm text-sm text-white/55">Check you have the whole link, from the page or email it came in.</p>
        </>
      ) : row.revokedAt ? (
        <>
          <h1 className="fel-heading mt-3 text-2xl font-bold text-white">Already withdrawn</h1>
          <p className="mt-3 max-w-sm text-sm text-white/55">Your OK for {first} is withdrawn. Nothing else to do.</p>
        </>
      ) : (
        <>
          <h1 className="fel-heading mt-3 text-3xl font-bold text-white">Withdraw your OK for {first}?</h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            {row.acceptedAt
              ? `From the moment you tap this, FEL treats ${first} as not having your OK.`
              : `This request hasn't been confirmed yet. Withdrawing it means it can't be.`}
          </p>
          <WithdrawButton token={token} />
        </>
      )}
    </div>
  );
}
