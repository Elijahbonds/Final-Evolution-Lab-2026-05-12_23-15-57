import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { myCombines, type CombineDb, type MyCombine } from '@/lib/combine/server';
import { MyCombines } from '@/components/combine/my-combines';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Your combines' };

/**
 * COMBINE DAY (2026-10-25): the athlete's own combine numbers, as their coach recorded them, and where they placed in
 * each group. Their own rows only (lib/combine/server.ts myCombines); no other athlete's name or number. Signed in
 * (lib/screen/config.ts: '/train'). "Coming soon" until prisma/pending/2026-10-25-combine-day.sql is applied.
 */
export default async function MyCombinesPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath('/train/combine'));
  const r = await myCombines(prisma as unknown as CombineDb, userId).catch(() => ({ status: 200, body: { available: false, events: [] } }));
  const body = r.body as { available?: boolean; events?: MyCombine[] };
  return (
    <main className="mx-auto min-h-screen max-w-xl bg-[#050505] px-4 py-6 pb-24">
      <Link href="/train" className="text-[13px] text-white/50 hover:text-white">← Train</Link>
      <h1 className="mb-4 mt-2 text-3xl font-black text-white">Your combines</h1>
      <MyCombines available={body.available === true} events={body.events ?? []} />
    </main>
  );
}
