/**
 * /dev/coach-today — the client's Today tab as a client sees it, without a session or a database (MIRROR-COACH P2,
 * 2026-09-25). The real TodayView component; its reads and saves go to ./api, which runs the real Today server code
 * (lib/coach/todayServer.ts) over an in-memory store. ?reset=1 starts from the seed; ?view=training renders /training's
 * step-through (components/training/client-view/ClientSessionView.tsx) over the same store instead.
 *
 * Not linked from nav. Hard 404 outside development, like the other dev harnesses.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TodayHarness } from './harness';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — Today Harness',
  robots: { index: false, follow: false },
};

export default function DevCoachTodayPage({ searchParams }: { searchParams: { reset?: string; view?: string } }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <main className="mx-auto max-w-[900px] px-4 py-4">
        <TodayHarness reset={searchParams.reset === '1'} view={searchParams.view === 'training' ? 'training' : 'today'} />
      </main>
    </div>
  );
}
