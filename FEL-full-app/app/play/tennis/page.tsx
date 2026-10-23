import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TENNIS_VARIANTS, tennisVariantOf } from '@/lib/babylon/modes/tennisVariant';
import { couchRequested } from '@/lib/party/catalog';
import { CouchRoom, CouchStart } from '@/components/controller-link/couch-start';
import { TennisLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

// TENNIS-TIEBREAK-FOLD (2026-10-22): `?variant=tiebreak` plays the Tennis tiebreak variant (lib/babylon/modes/tennisVariant).
export default async function TennisPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const variant = tennisVariantOf(searchParams?.variant);
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath(TENNIS_VARIANTS[variant].path));
  // FN-0 COUCH: the signed-in visitor hosts; seats 2–4 join by pad or phone code (no camera, no party chat)
  if (couchRequested(searchParams)) return <CouchRoom modeId="tennis" />;
  return <><TennisLoader variant={variant} /><CouchStart modeId="tennis" /></>;
}
