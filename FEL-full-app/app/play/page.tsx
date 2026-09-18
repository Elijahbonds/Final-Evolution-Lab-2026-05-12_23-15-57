import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// The Lab (/modes) is the mode menu. Bare /play was a 404 that retired-mode
// redirects used to aim at — keep the old stem alive as a forward.
export default async function PlayIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  redirect('/modes');
}
