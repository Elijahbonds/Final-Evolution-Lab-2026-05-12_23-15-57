import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { ShardStore } from '@/components/wallet/shard-store';
import { coinPacksOnSale } from '@/lib/wallet/purchases';

export const dynamic = 'force-dynamic';

export default async function ShardShopPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/shop/shards'));
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <Suspense fallback={null}>
        {/* EVERY-SCREEN P10: the server's answer (the same one GET /api/v1/wallet/config gives), so the packs are drawn, or
            not, from the first paint: they used to show while the flag loaded and then vanish (layout shift 0.272) */}
        <ShardStore initialPurchasesEnabled={coinPacksOnSale()} />
      </Suspense>
    </div>
  );
}
