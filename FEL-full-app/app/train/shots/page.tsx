import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { TabPage } from '@/components/shell/tab-page';
import { ShotSession } from '@/components/hoops-cam/shot-session';
import { hoopsCamAccess } from '@/lib/hoops-cam/gate';
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
  return (
    <TabPage eyebrow="Train" title="Shots & dribbles" lede="Your makes, misses and dribbles from your phone's camera. A beta: fix any call with a tap." accent="#FF8A3D"
      aside={<Link href="/train" className="rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white">← Train</Link>}>
      <div className="mx-auto max-w-md">
        {access.ok ? <ShotSession tier={access.tier} startMode={mode} /> : (
          <div className="fel-card rounded-xl p-5 text-sm text-white/75" data-hoops-refused={access.error}>{access.error === 'under_13' ? UNDER_13_LINE : AGE_UNKNOWN_LINE}</div>
        )}
      </div>
    </TabPage>
  );
}
