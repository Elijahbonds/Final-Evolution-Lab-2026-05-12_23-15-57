import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { TabPage } from '@/components/shell/tab-page';
import { VelocitySession } from '@/components/vbt/velocity-session';
import { vbtAccess } from '@/lib/vbt/gate';
import { AGE_UNKNOWN_LINE, UNDER_13_LINE } from '@/lib/vbt/copy';

export const dynamic = 'force-dynamic';

/**
 * BAR SPEED (VBT, 2026-10-25; owner: camera only — barbell, DB/KB, body-only and med-ball throws). 13 and over, a teen
 * technique speed only (lib/vbt/gate.ts): under 13 or an unknown age read one plain line and no camera is asked for. The
 * tool itself is components/vbt/velocity-session.tsx.
 */
export default async function VelocityPage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath('/train/velocity'));
  const access = vbtAccess({ signedIn: true, dobYear: await readDobYear(prisma, me, 'vbt_page') });
  return (
    <TabPage eyebrow="Train" title="Bar speed" lede="Rep speed from your camera, side-on. Every number is an estimate, not a lab number." accent="#00E5FF"
      aside={<Link href="/train" className="rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white">← Train</Link>}>
      <div className="mx-auto max-w-md">
        {access.ok ? <VelocitySession /> : (
          <div className="fel-card rounded-xl p-5 text-sm text-white/75" data-vbt-refused={access.error}>{access.error === 'under_13' ? UNDER_13_LINE : AGE_UNKNOWN_LINE}</div>
        )}
      </div>
    </TabPage>
  );
}
