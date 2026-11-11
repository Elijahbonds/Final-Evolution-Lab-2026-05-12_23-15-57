import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { CoinStore } from '@/components/wallet/coin-store';
import { coinPacksOnSale } from '@/lib/wallet/purchases';

export const dynamic = 'force-dynamic';

export default async function StorePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/store'));
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      {/* SCREEN-FIXES (2026-11-10): the server's answer on whether coin packs sell, so the first draw is the right one: the
          packs used to be drawn and then removed once the client asked, a layout shift of 0.42 (the budget is 0.02) */}
      <CoinStore initialPurchasesEnabled={coinPacksOnSale()} />
    </div>
  );
}
