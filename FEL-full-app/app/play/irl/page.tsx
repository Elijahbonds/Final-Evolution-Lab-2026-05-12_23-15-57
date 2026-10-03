import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginRedirect, type LoginRedirectSearchParams } from '@/lib/auth/safeNext';
import { IrlLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function IrlPage({ searchParams }: { searchParams?: LoginRedirectSearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirect('/play/irl', searchParams));
  // Standard chrome — a menu screen with no header/nav is a dead end.
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <IrlLoader />
    </div>
  );
}
