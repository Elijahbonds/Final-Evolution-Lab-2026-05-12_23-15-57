import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { IrlLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function IrlPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <IrlLoader />;
}
