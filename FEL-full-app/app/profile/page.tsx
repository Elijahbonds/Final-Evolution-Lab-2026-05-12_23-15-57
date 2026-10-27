import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { loadProfile, type ProfileDb } from '@/lib/profile-v2/load';
import { TabPage } from '@/components/shell/tab-page';
import { DoorsRow } from '@/components/shell/doors-row';
import { ProfileBody, ProfileActions } from '@/components/profile-v2/profile-body';
import { AthleteStatusSection } from '@/components/profile/athlete-status-card';
import { PALETTE } from '@/lib/design/palette';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * PROFILE — PROFILE V2 (owner 2026-10-24: "We've gotta improve the profile view too"). docs/PROFILE-V2.md.
 *
 * It leads with progress, the product's promise ("get measurably better"): the athlete, the PRQ grade and this week's
 * measured numbers against last week. Then four blocks, each with one job: stats and bests, badges and milestones,
 * squad and friends, highlights; then who can see it. Editing (the athlete pick, the creator card, the referral card,
 * logging a measurement) moved to /profile/edit, and the settings (motion, data rights, health data) to /account.
 *
 * Everything on it is read on the server in one batch (lib/profile-v2/load.ts) — the page used to draw an empty shell
 * and fetch eight things after it hydrated. The 3D athlete loads only when asked for.
 */
export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !me) redirect(loginPath('/profile'));

  const data = await loadProfile(prisma as unknown as ProfileDb, me);

  return (
    <TabPage eyebrow={t('profile.eyebrow')} title={data.identity.name} lede={t('profile.lede')} accent={PALETTE.gold}
      aside={<ProfileActions />}
    >
      <ProfileBody data={data} />

      {/* #337: the athlete status card (components/profile/athlete-status-card.tsx), placed under the profile body */}
      <AthleteStatusSection userId={me} />
      <DoorsRow tab="profile" hide={isCoachStoreEnabled() ? [] : ['/account/bookings']} />
    </TabPage>
  );
}
