import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TabPage } from '@/components/shell/tab-page';
import { CoachShots } from '@/components/hoops-cam/coach-shots';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Shot charts — coach' };

/** BBS-04 (2026-11-03): the coach's shot charts — each client who shares, and the teams the coach runs. Dark until the
 *  pending SQL (prisma/pending/2026-11-03-hoops-cam.sql) is applied. */
export default async function CoachShotsPage() {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string } | undefined)?.id) redirect(loginPath('/coach/shots'));
  return (
    <TabPage eyebrow="Coach" title="Shot charts" accent="#FF8A3D">
      <div className="mx-auto max-w-xl">
        <CoachShots />
      </div>
    </TabPage>
  );
}
