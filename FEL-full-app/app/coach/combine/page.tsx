import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { CombineApp } from '@/components/combine/combine-app';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Combine day' };

/**
 * COMBINE DAY (lane/combine-day, 2026-10-25; owner: "team tryout / combine day" — a coach runs a measured combine
 * through the Mirror: jump, sprint, agility and skills, and gets a ranked report). Signed in (lib/screen/config.ts:
 * '/coach'). The athletes are the coach's live roster under the team gate (lib/combine/gate.ts); a combine runs as a
 * draft on this device and is saved to the account once prisma/pending/2026-10-25-combine-day.sql is applied. The coach's
 * own birth year goes to the client only for body play's grown-up step on the skill drill (as /play/drills does).
 */
export default async function CombineDayPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath('/coach/combine'));
  const dobYear = await readDobYear(prisma, userId, 'combine_page');
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-fel-bg px-4 py-6 pb-24">
      <Link href="/coach" className="text-[13px] text-white/50 hover:text-white">← Coach</Link>
      <header className="mb-5 mt-2 space-y-1">
        <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-fel-cyan">Combine day</p>
        <h1 className="text-3xl font-black text-white">Tryouts and testing days</h1>
        <p className="text-[14px] text-white/55">Jump, agility, sprint and a skill drill, station by station on this device, then a ranked report.</p>
      </header>
      <CombineApp dobYear={dobYear} />
    </main>
  );
}
