import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { CreatorHub } from './_components/hub';

export const dynamic = 'force-dynamic';

export default async function CreatorPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // Standard chrome — a menu screen with no header/nav is a dead end.
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <CreatorHub />
    </div>
  );
}
