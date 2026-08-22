import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { CalibrateClient } from './_components/calibrate-client';

export const dynamic = 'force-dynamic';

export default async function CalibratePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <main className="mx-auto max-w-[720px] px-4 py-6">
        <h1 className="fel-heading text-3xl font-bold text-white">AUDIO CALIBRATION</h1>
        <p className="mt-1 text-sm text-white/50">
          Tap in time with the click to measure your device&apos;s audio latency. Every rhythm mode
          shifts its timing windows by this offset so the beat feels centered on your setup.
        </p>
        <CalibrateClient />
      </main>
      <BottomNav />
    </div>
  );
}
