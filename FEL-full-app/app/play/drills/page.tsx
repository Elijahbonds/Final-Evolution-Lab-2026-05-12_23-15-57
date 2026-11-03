import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { loadWarmupContext } from '@/lib/coach/warmupServer';
import { FALLBACK_WARMUP_CONTEXT, type WarmupContext } from '@/lib/coach/warmup';
import { logGateFailure } from '@/lib/privacy/scanSaveGate';
import { drillsAccess } from '@/lib/drills/access';
import { DRILLS_PATH, DRILL_PARAM, drillHref, routeDrill } from '@/lib/drills/route';
import { bookLessonsFor } from '@/lib/drills/playbookLinks';
import { DrillsApp } from './_components/drills-app';

export const dynamic = 'force-dynamic';

/**
 * /play/drills — the Playbook's drills on the camera (Mirror & coaching plan Phase 6, "drills and warm-up by body",
 * 2026-10-07; movement-play P9's route). The drill engine (lib/drills: the charts, DrillRunner) runs against body play's
 * space check and the games' body reader, on the device.
 *
 * Signed in, like the Mirror and Train: the page reads, on the server, the same context Today's warm-up reads
 * (lib/coach/warmupServer.ts loadWarmupContext — youth, today's pain decision, the intake hard stop, P8's jump gate) and
 * decides from it which drills run today (lib/drills/access.ts). A read that fails is the careful context (youth rules,
 * no jumps), said as such. The birth year goes to the client only for body play's grown-up step.
 *
 * WRITES NOTHING, for any age. There is no clean save path for a drill today: a game session (/api/sessions) is a mode
 * with an economy rule and pay; a Mirror session (/api/mirror/sessions) is the press/row runtime's summary; neither fits
 * a drill's phases and holds without a new schema or rule. So a drill's result is shown and kept nowhere.
 */
export default async function DrillsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const raw = searchParams?.[DRILL_PARAM];
  const drill = routeDrill(typeof raw === 'string' ? raw : null);
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(loginPath(drill ? drillHref(drill.id) : DRILLS_PATH));

  const [ctx, user] = await Promise.all([
    loadWarmupContext(prisma, userId).catch((e: unknown): WarmupContext => {
      logGateFailure('drills_page_context_failed', e);
      return FALLBACK_WARMUP_CONTEXT;
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null),
  ]);
  const access = drillsAccess(ctx);

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-6">
        <Link href="/train" className="inline-flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white">
          <ArrowLeft aria-hidden className="h-4 w-4" /> Train
        </Link>
        <header className="space-y-1">
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#00FF9D]">Drills</p>
          <h1 className="text-3xl font-black text-white">The Playbook&apos;s drills, on your camera</h1>
          <p className="text-[14px] text-white/55">The wake-up from chapter 5 and the jump-and-land drills from chapter 6. Set the phone up, run the space check, follow the targets.</p>
        </header>
        <DrillsApp access={access} drillId={drill?.id ?? null} lessons={drill ? bookLessonsFor(drill) : []} dobYear={user?.dobYear ?? null} />
      </div>
    </div>
  );
}
