import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { FootballLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function FootballPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play/football'));
  return <FootballLoader />;
}
