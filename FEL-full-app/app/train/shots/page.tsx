import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { canSaveScanNumbers, readDobYear } from '@/lib/privacy/scanSaveGate';
import { TabPage } from '@/components/shell/tab-page';
import { ShotSession } from '@/components/hoops-cam/shot-session';
import { hoopsCamAccess } from '@/lib/hoops-cam/gate';
import { serverKeeps, type HoopsDb } from '@/lib/hoops-cam/server';
import { AGE_UNKNOWN_LINE, UNDER_13_LINE } from '@/lib/hoops-cam/copy';

export const dynamic = 'force-dynamic';

/**
 * SHOTS AND DRIBBLES (BBS-01 / BBS-02, 2026-10-26): a real ball on the phone camera — makes and misses against a rim the
 * player marks once, a shot chart and a make-% trend; dribbles counted with crossovers, rate and rhythm. A BETA with
 * tap-to-correct and no accuracy claim (owner). 13 and over (lib/hoops-cam/gate.ts); a teen's sessions are not kept. The
 * tool is components/hoops-cam/shot-session.tsx; the ball detector is plain JS (lib/hoops-cam/ball.ts) and loads only
 * here.
 */
export default async function ShotsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  const mode = searchParams?.mode === 'dribble' ? 'dribble' : 'shots';
  if (!me) redirect(loginPath(mode === 'dribble' ? '/train/shots?mode=dribble' : '/train/shots'));
  const access = hoopsCamAccess({ signedIn: true, dobYear: await readDobYear(prisma, me, 'hoops_cam_page') });
  // BBS-04: a verified adult who opted in, once the table is applied, also keeps sessions on the account (for a coach)
  const serverKeep = access.ok && access.tier === 'adult' && (await serverKeeps(prisma as unknown as HoopsDb, await canSaveScanNumbers(prisma, me)));
  return (
    // PLAT-P09: no lede and no second "Train" link (the session's own footer has one): fewer words before the camera
    <TabPage eyebrow="Train" title="Shots & dribbles" accent="#FF8A3D">
      <div className="mx-auto max-w-md">
        {access.ok ? <ShotSession tier={access.tier} startMode={mode} serverKeep={serverKeep} /> : (
          <div className="fel-card rounded-xl p-5 text-sm text-white/75" data-hoops-refused={access.error}>{access.error === 'under_13' ? UNDER_13_LINE : AGE_UNKNOWN_LINE}</div>
        )}
      </div>
    </TabPage>
  );
}
