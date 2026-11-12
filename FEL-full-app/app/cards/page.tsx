import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { CardsView } from '@/components/cards-view';
import { prisma } from '@/lib/db';
import { readWallet } from '@/lib/wallet/wallet-service';
import { ownedFromEntitlements } from '@/lib/cards/boosts';
import { BoostShelf } from '@/components/cards/boost-shelf';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/cards'));
  // PROFILE V2 (2026-10-24): the boost shelf moved here from the Profile tab — it is cards you buy, and this is the cards
  // page. Same two reads it had there: the wallet's shards (the balance spend() takes) and the account's entitlements.
  const me = (session.user as { id?: string } | undefined)?.id;
  const [entitlements, wallet] = await Promise.all([
    me ? prisma.playerEntitlement.findMany({ where: { playerId: me }, select: { skuId: true } }).catch(() => []) : [],
    me ? readWallet(prisma, me).catch(() => null) : null,
  ]);
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <CardsView />
      <div className="mx-auto max-w-[1100px] px-4"><BoostShelf shards={wallet?.shards ?? 0} owned={ownedFromEntitlements(entitlements.map((e) => e.skuId))} /></div>
    </div>
  );
}
