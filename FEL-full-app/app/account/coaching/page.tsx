import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isCoachStoreEnabled } from '@/lib/flags';
import { isMissingTable, logStoreUnavailable } from '@/lib/coach-store/gate';
import { CancelMembership } from '@/components/coach-store/cancel-membership';
import { ReissueCode } from '@/components/coach-store/reissue-code';

export const dynamic = 'force-dynamic';

export default async function CoachingAccountPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(`/login?next=${encodeURIComponent('/account/coaching')}`);
  if (!isCoachStoreEnabled()) {
    return <main className="mx-auto max-w-xl px-4 py-8 text-white"><p>Coaching is not open yet.</p><Link href="/account">Account</Link></main>;
  }
  try {
    const rows = await prisma.programAccess.findMany({ where: { userId } });
    return (
      <main className="mx-auto max-w-xl px-4 py-8 text-white">
        <h1 className="text-2xl font-black">Coaching</h1>
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-white/10 p-3 text-sm">
              <p>{row.lane} · {row.status} · review credits {row.reviewCredits}</p>
              {row.billing === 'month' ? <CancelMembership accessId={row.id} /> : null}
              {row.beneficiary === 'teen' ? <ReissueCode accessId={row.id} /> : null}
            </li>
          ))}
        </ul>
      </main>
    );
  } catch (err) {
    if (isMissingTable(err)) {
      logStoreUnavailable();
      return <main className="px-4 py-8 text-white">Coach store is not set up yet.</main>;
    }
    throw err;
  }
}
