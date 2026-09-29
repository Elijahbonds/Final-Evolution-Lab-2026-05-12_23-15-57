/**
 * /dev/coach-prescribe — the coach's "From their screen" panel and the athlete's "What to work on" card on a fixture
 * client, without a session or a database (MIRROR-COACH P3, 2026-09-26). The real ScreenPrescriptions component reads
 * its draft from ./api (coachDraft, the same function GET /api/coach/prescribe returns) and adds through ./api (the
 * builder's own builderAction over an in-memory program); the real ScreenNextSteps renders the same screen's grades.
 * ?case=flags|clear|retest|newer-ungraded picks the screen; ?reset=1 starts from the untouched program.
 *
 * Not linked from nav. Hard 404 outside development, like the other dev harnesses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CoachPrescribeHarness } from './harness';
import { isDevCase } from './fixture';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — Coach Prescription Harness',
  robots: { index: false, follow: false },
};

export default function DevCoachPrescribePage({ searchParams }: { searchParams: { case?: string; reset?: string; screenId?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  // ?case=live&screenId=… reads the screen /dev/mirror-coach-p3-screen stored from the served harness (MIRROR-COACH P3 live proof)
  const c = searchParams.case === 'live' ? 'live' : isDevCase(searchParams.case) ? searchParams.case : 'flags';
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <main className="mx-auto max-w-[900px] px-4 py-4">
        <CoachPrescribeHarness devCase={c} reset={searchParams.reset === '1'} screenId={searchParams.screenId} />
      </main>
    </div>
  );
}
