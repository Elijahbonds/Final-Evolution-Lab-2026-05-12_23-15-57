import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { TennisLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function TennisPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <TennisLoader />;
}
