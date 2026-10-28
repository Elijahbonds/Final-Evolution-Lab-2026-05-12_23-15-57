import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { TabPage } from '@/components/shell/tab-page';
import { ReadinessCheck } from '@/components/readiness/readiness-check';
import { ReadinessSurvey } from '@/components/coach/readiness-survey';   // COACH-DELIVERY COA-03 (2026-10-26)
import { checkAccess } from '@/lib/coach/readiness/gate';
import { ADULTS_ONLY_LINE } from '@/lib/coach/readiness/copy';

export const dynamic = 'force-dynamic';

/**
 * DAILY READINESS (COACH-READINESS, 2026-10-25; owner: "a 30-second daily jump check; if readiness drops past the
 * coach's threshold, the day eases off and the coach is told"). Verified adults only (lib/coach/readiness/gate.ts):
 * anyone else reads one plain line and no camera is asked for. The check itself is components/readiness/readiness-check.tsx.
 */
export default async function ReadinessPage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath('/train/readiness'));
  const access = checkAccess({ signedIn: true, dobYear: await readDobYear(prisma, me, 'readiness_page') });
  return (
    <TabPage eyebrow="Train" title="Readiness check" lede="Three jumps against your own normal: ready, normal or low, and why." accent="#00E5FF"
      aside={<Link href="/train" className="rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white">← Train</Link>}>
      <div className="mx-auto max-w-md">
        {/* COACH-DELIVERY COA-03: the five-question survey beside the jump check, for a day with no room to jump (adults
            only, like the check; it shows once the pending SQL is applied) */}
        {access.ok ? <div className="space-y-4"><ReadinessCheck /><ReadinessSurvey /></div> : (
          <div className="fel-card rounded-xl p-5 text-sm text-white/75" data-readiness-adults-only>{ADULTS_ONLY_LINE}</div>
        )}
      </div>
    </TabPage>
  );
}
