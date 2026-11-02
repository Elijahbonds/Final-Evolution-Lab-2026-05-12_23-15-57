import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { TabPage } from '@/components/shell/tab-page';
import { ProgressView } from '@/components/progress/progress-view';
import { loadSavedProgress, NOTHING_SAVED, type ProgressDb } from '@/lib/results/progressServer';
import { PROGRESS_COPY } from '@/lib/results/copy';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'My progress' };

/**
 * MY PROGRESS (PLAT-P03, 2026-10-28): your numbers over time, one row per measure — saved ones for a verified adult who
 * opted in, the ones this phone keeps for everyone else, and your combines (lib/results/progressServer.ts,
 * components/progress/progress-view.tsx). Signed in (lib/screen/config.ts). The page only reads: nothing is written.
 */
export default async function ProgressPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath('/train/progress'));
  const saved = await loadSavedProgress(prisma as unknown as ProgressDb, userId).catch(() => NOTHING_SAVED);
  return (
    <TabPage eyebrow={PROGRESS_COPY.eyebrow} title={PROGRESS_COPY.title} lede={PROGRESS_COPY.lede}
      aside={<Link href="/train" className="rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white">← Train</Link>}>
      <div className="mx-auto max-w-md">
        <ProgressView saved={saved} />
      </div>
    </TabPage>
  );
}
