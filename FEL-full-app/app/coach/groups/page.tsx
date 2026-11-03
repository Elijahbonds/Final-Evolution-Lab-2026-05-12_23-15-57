import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { CoachGroups } from '@/components/group-booking/coach-groups';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Groups · Coach', robots: { index: false, follow: false } };

// GROUP-BOOKING (owner, 2026-11-02): the coach's groups — rosters with attendance and "paid in person", move gym, message
// the group, the under-6 decision, gyms, trainers and in-person 1:1s.
export default async function CoachGroupsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/coach/groups'));
  return (
    <main className={L.page} data-page="coach-groups">
      <p className={L.eyebrow}>Coach</p>
      <h1 className={L.title}>Groups</h1>
      <div className="mt-6"><CoachGroups /></div>
      <div className={L.section}><Link href="/groups" className={L.buy}>See the public page</Link></div>
    </main>
  );
}
