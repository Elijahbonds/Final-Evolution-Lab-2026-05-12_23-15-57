import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { CalibrateClient } from './_components/calibrate-client';

export const dynamic = 'force-dynamic';

export default async function CalibratePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <main className="mx-auto max-w-[720px] px-4 py-6">
        <h1 className="fel-heading text-3xl font-bold text-white">AUDIO CALIBRATION</h1>
        {/* No rhythm mode reads the saved offset yet (loadAudioOffsetMs has no reader outside this screen), so the
            copy must not say the windows move. lib/feel/rhythm-calibrate.test.ts holds it to that. */}
        <p className="mt-1 text-sm text-white/50">
          Tap in time with the click to measure your device&apos;s audio delay. The offset is saved on this
          device for rhythm modes to use; they do not apply it yet.
        </p>
        <CalibrateClient />
      </main>
    </div>
  );
}
