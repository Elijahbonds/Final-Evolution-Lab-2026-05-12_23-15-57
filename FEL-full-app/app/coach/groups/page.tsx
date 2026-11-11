import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { CoachGroups } from '@/components/group-booking/coach-groups';
import { OpensSoon } from '@/components/shop/opens-soon';
import { prisma } from '@/lib/db';
import { groupBookingOpen, type GroupDb } from '@/lib/group-booking/server';
import { GROUP_DARK } from '@/lib/group-booking/copy';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Groups · Coach', robots: { index: false, follow: false } };

// GROUP-BOOKING (owner, 2026-11-02): the coach's groups — rosters with attendance and "paid in person", move gym, message
// the group, the under-6 decision, gyms, trainers and in-person 1:1s.
export default async function CoachGroupsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/coach/groups'));
  // EVERY-SCREEN P5: whether booking is open is known here, so a switched-off board is drawn with the page (it was a
  // "Loading…" line the notice then pushed down: the rig measured a layout shift of 0.022)
  const open = await groupBookingOpen(prisma as unknown as GroupDb);
  return (
    <main className={L.page} data-page="coach-groups">
      <p className={L.eyebrow}>Coach</p>
      <h1 className={L.title}>Groups</h1>
      <div className="mt-6">{open ? <CoachGroups /> : <OpensSoon why={GROUP_DARK.coach.why} instead={GROUP_DARK.coach.instead} />}</div>
      <div className={L.section}><Link href="/groups" className={L.buy}>See the public page</Link></div>
    </main>
  );
}
