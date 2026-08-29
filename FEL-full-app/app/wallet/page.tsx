import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShoppingCart, Gem } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { LedgerHistory } from '@/components/wallet/ledger-history';
import { ExchangeWidget } from '@/components/wallet/exchange-widget';

export const dynamic = 'force-dynamic';

export default async function WalletPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <AppHeader />
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 pt-4">
        <Link href="/store" className="inline-flex items-center gap-2 rounded-lg border border-[#FFD700]/40 bg-[#FFD700]/5 px-3 py-1.5 text-sm font-semibold text-[#FFD700] transition hover:bg-[#FFD700]/10">
          <ShoppingCart className="h-4 w-4" /> Coin Store
        </Link>
        <Link href="/shop/shards" className="inline-flex items-center gap-2 rounded-lg border border-[#C79BFF]/40 bg-[#C79BFF]/5 px-3 py-1.5 text-sm font-semibold text-[#C79BFF] transition hover:bg-[#C79BFF]/10">
          <Gem className="h-4 w-4" /> Get Shards
        </Link>
      </div>
      <ExchangeWidget />
      <LedgerHistory />
      <BottomNav />
    </div>
  );
}
