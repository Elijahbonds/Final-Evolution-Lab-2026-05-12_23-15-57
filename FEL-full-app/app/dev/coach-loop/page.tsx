/**
 * /dev/coach-loop — the coach's program builder and the client's Today over ONE store (MIRROR-COACH P2 live proof,
 * 2026-09-26). ?view=builder (default) is the coach, ?view=today the client's Today tab, ?view=training the client's
 * /training step-through; ?reset=1 starts from an empty week. See ./api for what runs server-side.
 *
 * Not linked from nav. Hard 404 outside development, like the other dev harnesses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CoachLoopHarness } from './harness';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — Coach Loop Harness',
  robots: { index: false, follow: false },
};

export default function DevCoachLoopPage({ searchParams }: { searchParams: { reset?: string; view?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const view = searchParams.view === 'today' ? 'today' : searchParams.view === 'training' ? 'training' : 'builder';
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <main className="mx-auto max-w-[900px] px-4 py-4">
        <CoachLoopHarness reset={searchParams.reset === '1'} view={view} />
      </main>
    </div>
  );
}
