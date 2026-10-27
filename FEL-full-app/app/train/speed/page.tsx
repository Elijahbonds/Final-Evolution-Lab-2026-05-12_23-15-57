import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { readDobYear, verifiedAdult } from '@/lib/privacy/scanSaveGate';
import { TabPage } from '@/components/shell/tab-page';
import { SpeedApp } from '@/components/sprint/speed-app';
import { ADULTS_ONLY_LINE } from '@/lib/sprint/copy';

export const dynamic = 'force-dynamic';

/**
 * SPRINT SPEED BY CAMERA (SPRINT-SPEED, 2026-10-25; owner: "measure sprint speed by camera"). Verified adults only, like
 * every camera test in the app (the Quick Screen's camera is 18+, combine day's camera stations are a verified adult's):
 * anyone else reads one plain line and no camera is asked for. OWNER CALL (flagged): teens. The app is
 * components/sprint/speed-app.tsx; every number it shows is an estimate with its own ±, kept on the phone only.
 */
export default async function SpeedPage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath('/train/speed'));
  const adult = verifiedAdult(await readDobYear(prisma, me, 'sprint_speed_page'));
  return (
    <TabPage eyebrow="Train" title="Sprint speed" lede="Time a sprint, a flying 10 or a 5-10-5 with your phone's camera, and read your top speed. Every number is an estimate." accent="#00FF9D"
      aside={<Link href="/train" className="rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white">← Train</Link>}>
      <div className="mx-auto max-w-md">
        {adult ? <SpeedApp /> : (
          <div className="fel-card rounded-xl p-5 text-sm text-white/75" data-sprint-adults-only>{ADULTS_ONLY_LINE}</div>
        )}
      </div>
    </TabPage>
  );
}
