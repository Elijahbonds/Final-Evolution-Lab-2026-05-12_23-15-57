import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { groupsBoard, type GroupDb } from '@/lib/group-booking/server';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { OpensSoon } from '@/components/shop/opens-soon';
import { GROUP_DARK } from '@/lib/group-booking/copy';
import { GroupJoin, type GroupsBoardView } from '@/components/group-booking/groups-browser';
import { ShareGroup } from '@/components/group-booking/share-group';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Join the group · Final Evolution', robots: { index: false, follow: false } };

// GROUP-BOOKING: one group's own page, the link (and QR) a coach shares. Join in two taps from here. A cancelled, finished or
// unknown group — or before the pending SQL — says "Opens soon" and links to every group.
export default async function GroupPage({ params }: { params: { groupId: string } }) {
  let board: GroupsBoardView = { available: false };
  try {
    board = (await groupsBoard(prisma as unknown as GroupDb, new Date(), process.env, params.groupId)).body as unknown as GroupsBoardView;
  } catch (e) {
    console.warn('[group-booking] group read failed', e instanceof Error ? e.name : typeof e);
  }
  const g = board.available ? board.groups?.[0] : undefined;
  return (
    <main className={L.page} data-page="group">
      <p className={L.eyebrow}>Group training</p>
      {g ? (
        <>
          <h1 className={L.title}>{g.name}</h1>
          <p className={L.lede}>{g.gymName}{g.gymAddress ? `, ${g.gymAddress}` : ''} · {g.days} · {g.time} · {g.startLabel} – {g.endLabel} · with {g.trainerName}</p>
          <p className={`${L.lede} mt-1`}>{board.format}</p>
          <div className="mt-6"><GroupJoin g={g} format={board.format ?? ''} cancelLine={board.cancelLine ?? ''} /></div>
          <ShareGroup path={`/groups/${g.id}`} />
        </>
      ) : <OpensSoon why={GROUP_DARK.groups.why} instead={GROUP_DARK.groups.instead} />}
      <div className={L.section}><Link href="/groups" className={L.buy}>All groups</Link></div>
    </main>
  );
}
