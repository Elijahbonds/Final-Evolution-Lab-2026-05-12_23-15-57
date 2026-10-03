import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginRedirect, type LoginRedirectSearchParams } from '@/lib/auth/safeNext';
import { CarnivalRecapClient } from './_components/recap-client';

export const dynamic = 'force-dynamic';

export default async function CarnivalRecapPage({ searchParams }: { searchParams?: LoginRedirectSearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirect('/play/carnival/recap', searchParams));
  return <CarnivalRecapClient />;
}
