import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { CardsView } from '@/components/cards-view';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?next=%2Fcards');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <CardsView />
    </div>
  );
}
