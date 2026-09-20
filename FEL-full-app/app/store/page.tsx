import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { CoinStore } from '@/components/wallet/coin-store';

export const dynamic = 'force-dynamic';

export default async function StorePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <CoinStore />
    </div>
  );
}
