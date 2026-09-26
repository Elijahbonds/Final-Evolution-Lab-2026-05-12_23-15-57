import { notFound } from 'next/navigation';
import { MirrorHarness } from '@/app/play/mirror/_components/mirror-harness';

export const dynamic = 'force-dynamic';

/**
 * Dev-only mount of the Mirror harness without /play/mirror's sign-in gate (MIRROR-COACH P1, 2026-09-25).
 *
 * The lane's dev server runs with its database deliberately offline, so the real route's getServerSession can never
 * pass there; this is how the harness's truth fixes (the knee row, the stage step, the screen panel and picker) are
 * looked at in a browser. Same component, nothing added. Hard 404 outside `next dev`.
 */
export default function DevMirrorTruthPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <MirrorHarness />
    </div>
  );
}
