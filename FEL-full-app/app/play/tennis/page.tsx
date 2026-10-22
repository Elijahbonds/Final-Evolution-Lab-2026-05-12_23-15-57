import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TENNIS_VARIANTS, tennisVariantOf } from '@/lib/babylon/modes/tennisVariant';
import { TennisLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

// TENNIS-TIEBREAK-FOLD (2026-10-22): `?variant=tiebreak` plays the Tennis tiebreak variant (lib/babylon/modes/tennisVariant).
export default async function TennisPage({ searchParams }: { searchParams?: { variant?: string | string[] } }) {
  const variant = tennisVariantOf(searchParams?.variant);
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath(TENNIS_VARIANTS[variant].path));
  return <TennisLoader variant={variant} />;
}
