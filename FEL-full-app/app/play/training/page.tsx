import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { TrainingLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function TrainingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play/training'));
  return <TrainingLoader />;
}
