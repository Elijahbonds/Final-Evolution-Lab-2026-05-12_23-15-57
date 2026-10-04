import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { BigAirLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function BigAirPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play/big-air'));
  return <BigAirLoader />;
}
