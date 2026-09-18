import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { CarnivalRecapClient } from './_components/recap-client';

export const dynamic = 'force-dynamic';

export default async function CarnivalRecapPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <CarnivalRecapClient />;
}
