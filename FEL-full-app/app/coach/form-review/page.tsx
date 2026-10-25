import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { recordContext, type FormReviewDb } from '@/lib/coach/formReview/server';
import { RecordSet } from '@/components/coach/form-review/record-set';
import { canSaveScanNumbers } from '@/lib/privacy/scanSaveGate';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Film a set' };

/** COACH-VIDEO-REVIEW (2026-10-24): film one set of a program exercise; the camera counts and flags, the coach reviews. */
export default async function FormReviewPage({ searchParams }: { searchParams: { slot?: string; program?: string; movement?: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const here = `/coach/form-review${searchParams.slot ? `?slot=${encodeURIComponent(searchParams.slot)}` : ''}`;
  if (!userId) redirect(loginPath(here));
  const ctx = await recordContext(prisma as unknown as FormReviewDb, userId, { slot: searchParams.slot ?? null, program: searchParams.program ?? null, movement: searchParams.movement ?? null }, await canSaveScanNumbers(prisma, userId));
  if (!ctx) notFound();
  return (
    <main className="mx-auto min-h-screen max-w-xl bg-[#050505] px-4 py-6 pb-20">
      <RecordSet ctx={ctx} />
    </main>
  );
}
