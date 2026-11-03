import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { oneOnOneBoard, type GroupDb } from '@/lib/group-booking/server';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { OneOnOneBooker, type OneOnOneView } from '@/components/group-booking/one-on-one-booker';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Book a 1:1 · Final Evolution', robots: { index: false, follow: true } };

// GROUP-BOOKING (owner, 2026-11-02): book Elijah (and, later, his trainers) for a session online or in person at a gym.
export default async function OneOnOnePage() {
  let view: OneOnOneView = { available: false };
  try {
    view = (await oneOnOneBoard(prisma as unknown as GroupDb)).body as unknown as OneOnOneView;
  } catch (e) {
    console.warn('[group-booking] 1:1 read failed', e instanceof Error ? e.name : typeof e);
  }
  return (
    <main className={L.page} data-page="one-on-one">
      <p className={L.eyebrow}>Train 1:1</p>
      <h1 className={L.title}>Book a session</h1>
      <OneOnOneBooker view={view} />
      <div className={L.section}><Link href="/groups" className={L.buy}>Groups</Link></div>
    </main>
  );
}
