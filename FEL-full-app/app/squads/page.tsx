import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { TabPage } from '@/components/shell/tab-page';
import { GroupsHome, type GroupsHomeData } from '@/components/groups/groups-home';
import { listGroups, type GroupsDb } from '@/lib/groups/server';
import { squadNameChoices } from '@/lib/groups/rules';

export const dynamic = 'force-dynamic';

/**
 * SQUADS AND TEAMS (TEAMS-SQUADS, 2026-10-25). Friends train together in a squad; a coach runs a team. One core
 * (lib/groups), members only, reactions only. Linked from the Train tab.
 */
export default async function SquadsPage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath('/squads'));
  const r = await listGroups(prisma as unknown as GroupsDb, me).catch(() => null);
  const data = (r?.body ?? { available: false, groups: [] }) as unknown as GroupsHomeData;
  return (
    <TabPage eyebrow="Train together" title="Squads and teams" lede="Do the daily drill together, keep a group streak, and race a weekly league. Reactions only." accent="#00E5FF">
      <GroupsHome initial={data} initialNames={squadNameChoices(Math.random)} />
    </TabPage>
  );
}
