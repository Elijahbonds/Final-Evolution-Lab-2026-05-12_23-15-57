import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { CarnivalLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function CarnivalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <CarnivalLoader />;
}
