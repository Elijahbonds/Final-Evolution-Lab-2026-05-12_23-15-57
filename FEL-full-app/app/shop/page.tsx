import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { ShopView } from '@/components/shop-view';

export const dynamic = 'force-dynamic';

export default async function ShopPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <ShopView />
    </div>
  );
}
