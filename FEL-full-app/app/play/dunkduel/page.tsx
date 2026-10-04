import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canSaveScanNumbers, readDobYear } from '@/lib/privacy/scanSaveGate';
import ProveIt from './_components/prove-it';

export const dynamic = 'force-dynamic';

// PROVE IT — the IRL head-to-head dunk contest (owner re-lock, 2026-09-01:
// "the head to head dunk contest is a real life actual footage dunk contest
// judged and scored by our AI's tracking PRQ, Flight Time, Dunk Difficulty").
// Real camera footage, on-device pose tracking, the judge panel. A clip stays
// on the phone. The Record button calls verifiedAdult (lib/privacy/verifiedAdult.ts)
// with this account's User.dobYear. Jump numbers are posted only when that check
// passes and the account opted in.
// The Babylon pass-and-play duel (DunkDuelMode) stays in the registry —
// /dev/mode/dunkduel still runs it. GameShell is not mounted here: it waits on
// /api/profile and would replace this camera contest with the Babylon game.
export default async function DunkDuelPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/login?next=${encodeURIComponent('/play/dunkduel')}`);
  const userId = (session.user as { id?: string } | undefined)?.id;
  const dobYear = userId ? await readDobYear(prisma, userId, 'prove_it_page') : null;
  const optedIn = userId ? await canSaveScanNumbers(prisma, userId) : false;
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <ProveIt dobYear={dobYear} optedIn={optedIn} />
    </div>
  );
}
