import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { groupsBoard, type GroupDb } from '@/lib/group-booking/server';
import { GROUP_COPY as T } from '@/lib/group-booking/copy';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { OpensSoon } from '@/components/shop/opens-soon';
import { GroupsBrowser, type GroupsBoardView } from '@/components/group-booking/groups-browser';
import { MyGroupSessions } from '@/components/group-booking/my-group-sessions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Groups · Final Evolution', robots: { index: false, follow: true } };

// GROUP-BOOKING (owner, 2026-11-02): join a group — by gym, days and time — and book a 1:1. "Opens soon" until the pending
// SQL is applied (lib/group-booking/store.ts), with nothing written.
export default async function GroupsPage() {
  let board: GroupsBoardView = { available: false };
  try {
    board = (await groupsBoard(prisma as unknown as GroupDb)).body as unknown as GroupsBoardView;
  } catch (e) {
    console.warn('[group-booking] board read failed', e instanceof Error ? e.name : typeof e);
  }
  const sizes = board.sizes ?? { min: 6, max: 8, weeks: 8 };
  return (
    <main className={L.page} data-page="groups">
      <p className={L.eyebrow}>Train in person</p>
      <h1 className={L.title}>{T.title}</h1>
      {board.available ? <p className={L.lede}>{T.lede(sizes.min, sizes.max, sizes.weeks)}</p> : null}
      {board.available ? <GroupsBrowser board={board} /> : <OpensSoon />}
      <div className={L.section}>
        <Link href="/groups/one-on-one" className={L.buy} data-action="one-on-one">{T.bookOneOnOne}</Link>
      </div>
      {board.available ? <MyGroupSessions /> : null}
    </main>
  );
}
