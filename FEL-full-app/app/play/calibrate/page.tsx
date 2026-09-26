import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { safeReturnPath } from '@/lib/feel/rhythm-calibrate';
import { CalibrateClient } from './_components/calibrate-client';

export const dynamic = 'force-dynamic';

// MUSIC-SUITE P2 (2026-09-25): the rooms link here with ?return=<path> (the dance pick screen, the Academy header), and
// the screen offers "Back to the room" once the offset is saved. Only a same-origin path is honoured (safeReturnPath);
// anything else is dropped and the screen falls back to "Back to modes". A signed-out player is sent to sign in with
// the way back in ?next= (as app/guidance/page.tsx does) — though the sign-in form does not read `next` yet
// (components/auth-form.tsx:126 lands on the first game), so today it is a way back for the day it does.
export default async function CalibratePage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const raw = searchParams?.return;
  const returnTo = safeReturnPath(Array.isArray(raw) ? raw[0] : raw);
  const session = await getServerSession(authOptions);
  if (!session) {
    const here = returnTo ? `/play/calibrate?return=${encodeURIComponent(returnTo)}` : '/play/calibrate';
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <main className="mx-auto max-w-[720px] px-4 py-6">
        <h1 className="fel-heading text-3xl font-bold text-white">AUDIO CALIBRATION</h1>
        {/* MUSIC-SUITE P2 (2026-09-25): the dance room (DanceMode.ts) and the Academy's PERFORM stage (StudioMode.tsx)
            read the saved offset now, and nothing else does — so the copy names those two and no more.
            lib/feel/rhythm-calibrate.test.ts holds every room named here to a file that reads the offset. */}
        <p className="mt-1 text-sm text-white/50">
          Tap in time with the click to measure your device&apos;s audio delay. The offset is saved on this
          device: the Cypher and the Groove Academy&apos;s PERFORM stage judge your taps by it. Other rhythm modes
          don&apos;t use it yet.
        </p>
        <p className="mt-1 text-xs text-white/40">
          Measure on the speakers or headphones you play with: Bluetooth headphones often add 200–300 ms, and a TV can
          add more. Switched devices? Measure again.
        </p>
        <CalibrateClient returnTo={returnTo} />
      </main>
    </div>
  );
}
