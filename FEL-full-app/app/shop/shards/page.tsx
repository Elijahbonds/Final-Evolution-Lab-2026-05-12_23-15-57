import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth';
import { ShardStore } from '@/components/wallet/shard-store';

export const dynamic = 'force-dynamic';

export default async function ShardShopPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <Suspense fallback={null}>
        <ShardStore />
      </Suspense>
    </div>
  );
}
