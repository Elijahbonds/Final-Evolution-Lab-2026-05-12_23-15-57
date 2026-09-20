import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import ProveIt from './_components/prove-it';

export const dynamic = 'force-dynamic';

// PROVE IT — the IRL head-to-head dunk contest (owner re-lock, 2026-09-01:
// "the head to head dunk contest is a real life actual footage dunk contest
// judged and scored by our AI's tracking PRQ, Flight Time, Dunk Difficulty").
// Real camera footage, on-device pose tracking, the judge panel — nothing
// uploaded. The Babylon pass-and-play duel (DunkDuelMode) was the
// transitional occupant of this route and stays in the registry —
// /dev/mode/dunkduel still runs it.
export default async function DunkDuelPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <ProveIt />
    </div>
  );
}
