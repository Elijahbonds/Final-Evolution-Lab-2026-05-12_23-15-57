import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginRedirect, type LoginRedirectSearchParams } from '@/lib/auth/safeNext';
import { ThreePointLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function ThreePointPage({ searchParams }: { searchParams?: LoginRedirectSearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirect('/play/threepoint', searchParams));
  return <ThreePointLoader />;
}
