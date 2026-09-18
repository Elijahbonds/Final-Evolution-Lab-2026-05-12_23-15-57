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
  // Navigation walls are data-driven by modes/shipStatus.ts. Keep the shipped
  // loader here so moving the mode on or off the wall is a registry-only change.
  if (isWalled('velocitykart')) {
    return <InDevelopment title="VELOCITY KART" reason={walledReason('velocitykart') ?? ''} />;
  }
  return <VelocityKartLoader />;
}
