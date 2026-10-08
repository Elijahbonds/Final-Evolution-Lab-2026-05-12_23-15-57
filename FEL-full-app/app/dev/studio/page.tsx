import { notFound } from 'next/navigation';
import { ClosetView } from '@/components/closet-view';

export const dynamic = 'force-dynamic';

/**
 * Dev-only Studio, no auth. Hard 404 outside `next dev`. CREATOR-PLAN phase 4d (2026-10-06).
 *
 * The same reasoning as /dev/creator: the shipping Studio (/closet) needs a session, and a screen nobody can open without
 * one is a screen nobody can look at on a phone or a TV. Here it runs as a guest under-18 / unknown-age player would see
 * it (adult={false}): the look stays on the device, nothing is uploaded, the server's closet answers 401 and the Studio
 * starts from a blank character. Chrome is hidden on /dev/ routes, so the stage takes the whole viewport.
 */
export default function DevStudioPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <div className="bg-[#050505] text-white">
      <ClosetView adult={false} fullBleed />
    </div>
  );
}
