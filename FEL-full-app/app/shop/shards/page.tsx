import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { ShardStore } from '@/components/wallet/shard-store';

export const dynamic = 'force-dynamic';

export default async function ShardShopPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/shop/shards'));
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <Suspense fallback={null}>
        <ShardStore />
      </Suspense>
    </div>
  );
}
