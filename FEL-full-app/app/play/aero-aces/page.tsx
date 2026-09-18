import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { isWalled, walledReason } from '@/lib/babylon/modes/shipStatus';
import { InDevelopment } from '@/components/games/in-development';
import { AeroAcesLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function AeroAcesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // Release wall stays data-driven: adding/removing the WALLED entry in
  // modes/shipStatus.ts is the only switch this player-facing route needs.
  if (isWalled('aeroaces')) {
    return <InDevelopment title="AERO ACES" reason={walledReason('aeroaces') ?? ''} />;
  }
  return <AeroAcesLoader />;
}
