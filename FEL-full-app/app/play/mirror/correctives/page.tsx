import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canSaveScanNumbers } from '@/lib/privacy/scanSaveGate';
import { latestIntake } from '@/lib/health/intake';
import { PRESS_ROW_PATTERN_ID, correctivesGate, intakeHold, programView, type SavedSetRow } from '@/lib/mirror/correctives';
import { CorrectivesView } from '@/components/mirror/correctives-view';

export const dynamic = 'force-dynamic';

/** How many of an athlete's newest saved press/row sets the program reads: its 8-set window and a few retest cycles. */
const SETS_READ = 40;

/**
 * /play/mirror/correctives — the Mirror's written correctives (MIRROR-COACH P9, 2026-09-30; PLAN item 9, rule (e)).
 *
 * READS ONLY. The birth year (the one age truth: lib/mirror/correctives.ts correctivesGate = youthGateFor = what
 * lib/mirror/youth.ts isMinorForMirror reads — never a guardian's consent), the latest health intake (P5: an intake due
 * or a red-flag stop holds the page back, the same line the Mirror itself holds), the athlete's own saved press/row sets
 * for the program, and whether this account's sets are kept at all (canSaveScanNumbers — a read of User; nothing is
 * written here or anywhere under it). Under youth rules nothing but the birth year is read. A read that fails is treated
 * as its conservative side: no birth year (youth rules), no intake (due), no sets.
 *
 * assumption: the program reads up to 40 saved sets for every athlete, where GET /api/mirror/sessions shows a free
 * athlete only their newest 5 — the program shows what it built (blocks, a retest line), never the history itself, so it
 * does not hand out the Pro history view. The owner may want the program behind Pro instead.
 */
export default async function MirrorCorrectivesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?next=%2Fplay%2Fmirror%2Fcorrectives');
  const userId = (session.user as { id?: string } | undefined)?.id;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null)
    : null;
  const youth = correctivesGate(user?.dobYear);

  let rows: SavedSetRow[] = [];
  let keeping = false;
  let hold: string | null = null;
  if (youth === null && userId) {
    // the Mirror's own intake line (P5): due, or a red-flag stop, holds the page back. A failed read is "no intake on file"
    // — due — the conservative side.
    hold = intakeHold(await latestIntake(prisma, userId).catch(() => null));
  }
  if (youth === null && userId && !hold) {
    rows = await prisma.mirrorSession
      .findMany({
        where: { userId, patternId: PRESS_ROW_PATTERN_ID },
        orderBy: { startedAt: 'desc' },
        take: SETS_READ,
        select: { patternId: true, startedAt: true, reps: true, faultCounts: true },
      })
      .catch(() => []);
    keeping = await canSaveScanNumbers(prisma, userId);
  }

  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <CorrectivesView youth={youth} hold={hold} program={programView(rows, youth, { keeping })} />
    </div>
  );
}
