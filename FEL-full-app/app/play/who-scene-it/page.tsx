import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginRedirect, type LoginRedirectSearchParams } from '@/lib/auth/safeNext';
import { WhoSceneItLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function WhoSceneItPage({ searchParams }: { searchParams?: LoginRedirectSearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirect('/play/who-scene-it', searchParams));
  return <WhoSceneItLoader />;
}
