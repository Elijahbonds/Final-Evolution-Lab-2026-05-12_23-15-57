import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginRedirect, type LoginRedirectSearchParams } from '@/lib/auth/safeNext';
import { isWalled, walledReason } from '@/lib/babylon/modes/shipStatus';
import { InDevelopment } from '@/components/games/in-development';
import { VelocityKartLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function VelocityKartPage({ searchParams }: { searchParams?: LoginRedirectSearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirect('/play/velocity-kart', searchParams));
  // Release wall stays data-driven: adding/removing the WALLED entry in
  // modes/shipStatus.ts is the only switch this player-facing route needs.
  if (isWalled('velocitykart')) {
    return <InDevelopment title="VELOCITY KART" reason={walledReason('velocitykart') ?? ''} />;
  }
  return <VelocityKartLoader />;
}
