import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { loadWarmupContext } from '@/lib/coach/warmupServer';
import { loadDailyDrill } from '@/lib/daily-drill/load';
import { DAILY_DRILL_PATH, DAILY_EYEBROW, STOPPED_LINE } from '@/lib/daily-drill/copy';
import { TodayDrillRun } from './_components/today-drill-run';

export const dynamic = 'force-dynamic';

/**
 * /train/today-drill — DAILY-DRILL (value round item 3, 2026-10-24): today's drill on the camera. The server picks it
 * (lib/daily-drill/load.ts: the weakest measured number, the drills page's own safety gates) and hands the client the
 * phases as references; the client rebuilds the chart from the catalogue and runs it with the drills page's camera
 * screen (app/play/drills/_components/drill-live.tsx). Finishing it claims the day (POST /api/daily-drill/claim): the
 * Lab Credits and the streak day, once. Nothing the camera read is sent.
 *
 * TODAY-DRILL (2026-10-27): the page's header (why today, what it improves, what you need) is TodayDrillRun's, so the
 * first-timer and the returning player each get their own order (today-drill-run.tsx).
 */
export default async function TodayDrillPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath(DAILY_DRILL_PATH));

  const [view, user] = await Promise.all([
    loadDailyDrill(prisma, userId, { warmupContext: (id, now) => loadWarmupContext(prisma, id, now) }),
    prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-6">
        <Link href="/train" className="inline-flex min-h-[44px] items-center gap-1.5 text-[16px] text-fel-soft hover:text-white">
          <ArrowLeft aria-hidden className="h-4 w-4" /> Train
        </Link>
        {view.plan
          ? <TodayDrillRun view={view} dobYear={user?.dobYear ?? null} />
          : (
            <section className="space-y-2" data-daily-stopped>
              <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-[#00FF9D]">{DAILY_EYEBROW}</p>
              <h1 className="text-3xl font-black text-white">Paused today</h1>
              <p className="rounded-xl border border-amber-300/25 p-4 text-[16px] text-white/80">{STOPPED_LINE}</p>
            </section>
          )}
      </div>
    </div>
  );
}
