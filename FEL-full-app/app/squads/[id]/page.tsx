import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { TabPage } from '@/components/shell/tab-page';
import { GroupScreen } from '@/components/groups/group-screen';
import { loadGroupView, type GroupsDb } from '@/lib/groups/server';
import { COMING_SOON, SQUADS_PATH } from '@/lib/groups/copy';
import type { GroupView } from '@/lib/groups/view';

export const dynamic = 'force-dynamic';

/** One squad or team, for its members only (anyone else: 404 — no group has a public page, so no minor is on one). */
export default async function GroupPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath(`/squads/${encodeURIComponent(params.id)}`));
  const r = await loadGroupView(prisma as unknown as GroupsDb, String(params.id), me);
  if (r.status === 404) notFound();
  const group = r.body.group as GroupView | undefined;
  return (
    <TabPage eyebrow="Train together" title={group ? (group.kind === 'team' ? 'Your team' : 'Your squad') : 'Squads and teams'} accent="#00E5FF">
      <Link href={SQUADS_PATH} className="-mt-4 mb-3 inline-flex min-h-[44px] items-center text-[13px] text-white/55">‹ All squads and teams</Link>
      {group ? <GroupScreen initial={group} /> : <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-[14px] text-white/70">{COMING_SOON}</p>}
    </TabPage>
  );
}
