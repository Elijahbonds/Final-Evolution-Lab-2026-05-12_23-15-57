import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { isWalled, walledReason } from '@/lib/babylon/modes/shipStatus';
import { InDevelopment } from '@/components/games/in-development';
import { VelocityKartLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function VelocityKartPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // THE WALL (2026-09-13). VELOCITY KART has not been through an A+ pass — it and Aero Aces are the only two
  // registered modes that have not — so it is visible and labelled rather than playable. The loader import
  // stays: coming off the wall is deleting the WALLED entry in modes/shipStatus.ts, nothing more.
  if (isWalled('velocitykart')) {
    return <InDevelopment title="VELOCITY KART" reason={walledReason('velocitykart') ?? ''} />;
  }
  return <VelocityKartLoader />;
}
