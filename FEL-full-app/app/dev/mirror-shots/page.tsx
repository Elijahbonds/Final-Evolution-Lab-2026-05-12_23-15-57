import { notFound } from 'next/navigation';
import { CoachView } from '@/app/coach/_components/coach-view';

export const dynamic = 'force-dynamic';

/**
 * Dev-only mount of the coach UI without /coach's sign-in gate (MIRROR-COACH P1 baseline, 2026-09-25).
 *
 * The lane's dev server runs with its database deliberately offline, so /coach's getServerSession never passes and its
 * API routes cannot answer. scripts/probes/_mirror-baseline.mts --frames loads this page and answers the component's
 * /api/coach/* calls with what the REAL routes returned on a fixture database (lib/coach/loop-baseline.test.ts), so the
 * baseline frames show the client's Today card and the coach's Clients tab as the routes serve them today. Same
 * component as /coach, nothing added. Hard 404 outside `next dev`.
 */
export default function DevMirrorShotsPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <CoachView />
    </div>
  );
}
