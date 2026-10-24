import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { readProfileRows, READ_CAP, type ProfileDb } from '@/lib/profile-v2/load';
import { buildProgressCard } from '@/lib/progress-card/card';
import { TabPage } from '@/components/shell/tab-page';
import { Coming } from '@/components/profile-v2/section';
import { ProgressCardView } from '@/components/progress-card/progress-card-view';
import { DeviceCard } from '@/components/progress-card/device-card';
import { ShareWeek } from '@/components/progress-card/share-week';

export const dynamic = 'force-dynamic';

/**
 * YOUR WEEK — the weekly progress card (value round item 1; the product promise, "get measurably better").
 *
 * This week against last week, from real rows only: jump, form, reaction and streak (profile v2's tiles, the same
 * gates), plus the games. Read on the server in the profile's one batch (lib/profile-v2/load.ts), so the page arrives
 * with its numbers. Only the form tile of an account that keeps its Mirror history on the phone hydrates (DeviceCard).
 * The share image is made on a tap. Before/after clips are a labelled seam: FEL keeps no clip of the user's own yet.
 */
export default async function WeekPage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !me) redirect(loginPath('/profile/week'));

  const now = new Date();
  const rows = await readProfileRows(prisma as unknown as ProfileDb, me, now);
  const card = buildProgressCard(me, rows, now, READ_CAP.played);
  const phoneForm = card.metrics.some((m) => m.key === 'form' && m.source === 'device');

  return (
    <TabPage eyebrow="Profile" title="Your week" lede="Proof of progress: what you measured and played, against the week before." accent="#00E5FF"
      aside={<Link href="/profile" className="rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white">← Back to profile</Link>}>
      {phoneForm ? <DeviceCard card={card} /> : <ProgressCardView card={card} />}
      <ShareWeek minor={card.minorOrUnknown} phoneOnly={phoneForm} />
      {/* SEAM (lib/progress-card/summary.ts ProgressCard.clips): before/after clips arrive with the user's own clip store */}
      <div className="mt-6">
        <Coming title="Before and after clips" text="Your own clips, this week beside last week. FEL doesn’t keep your clips yet, so there’s nothing to show here." />
      </div>
    </TabPage>
  );
}
