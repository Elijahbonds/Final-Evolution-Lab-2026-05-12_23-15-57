import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Gem, Shirt, Store, CalendarDays } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readWallet } from '@/lib/wallet/wallet-service';
import { prqScore, prqGrade } from '@/lib/prq';
import { gameVitals, ownedFromEntitlements } from '@/lib/cards/boosts';
import { TabPage } from '@/components/shell/tab-page';
import { DoorsRow } from '@/components/shell/doors-row';
import { ProfileView } from '@/components/profile-view';
import { BoostShelf } from '@/components/cards/boost-shelf';
import { ReferralCard } from '@/components/marketing/referral-card';
import { CardEditor } from '@/components/creator/card-editor';

export const dynamic = 'force-dynamic';

/**
 * PROFILE — who you are, what you have, where you stand.
 *
 * The third tab. It used to carry its own AppHeader and BottomNav; both are gone, because the shell now owns
 * getting around and a page that draws its own navigation is how an app ends up with three of them.
 */
export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!session) redirect('/login?next=%2Fprofile');

  const [profile, entitlements, wallet] = await Promise.all([
    me ? prisma.playerProfile.findUnique({ where: { userId: me } }).catch(() => null) : null,
    me ? prisma.playerEntitlement.findMany({ where: { playerId: me }, select: { skuId: true } }).catch(() => []) : [],
    // The SHARDS THAT BUY are the wallet's, not PlayerProfile.shards. Two fields carry that name and only this one
    // is what spend() decrements -- showing the other would price the shelf against a balance nobody can spend.
    me ? readWallet(prisma, me).catch(() => null) : null,
  ]);

  const base = prqScore(profile as unknown as Record<string, number> | null);
  const owned = ownedFromEntitlements(entitlements.map((e) => e.skuId));
  const vitals = gameVitals(base, owned);
  // The grade an athlete IS graded at is the measured one. The lift is shown beside it, labelled, never folded in.
  const grade = prqGrade(vitals.base);
  const shards = wallet?.shards ?? 0;

  const shortcuts = [
    { href: '/closet', icon: Shirt, accent: '#00E5FF', label: 'Closet' },
    { href: '/store', icon: Store, accent: '#FF7A2F', label: 'Store' },
    { href: '/wallet', icon: Gem, accent: '#A855F7', label: 'Wallet' },
    { href: '/sessions', icon: CalendarDays, accent: '#00FF9D', label: 'Sessions' },
  ];

  return (
    <TabPage
      eyebrow="Profile"
      title={session.user?.name ?? 'Athlete'}
      lede="Your measured self, your deck, and the card you hand to somebody else."
      accent="#FFD700"
      aside={
        <div className="flex items-end gap-5">
          <div className="text-right">
            <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/35">PRQ</p>
            <p className="fel-heading text-[34px] font-black leading-none" style={{ color: grade.color }}>
              {Math.round(vitals.base)}
            </p>
            <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: grade.color }}>
              {grade.label}
            </p>
          </div>
          {vitals.lift > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">In game</p>
              <p className="fel-heading text-[20px] font-black leading-none text-white">{Math.round(vitals.boosted)}</p>
              <p className="mt-0.5 font-mono text-[9px] text-[#A855F7]">+{vitals.lift} from cards</p>
            </div>
          )}
        </div>
      }
    >
      <nav className="mb-7 flex flex-wrap gap-2">
        {shortcuts.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2
                         text-[12.5px] font-bold text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              <Icon className="h-[15px] w-[15px]" style={{ color: s.accent }} strokeWidth={2.1} />
              {s.label}
            </Link>
          );
        })}
      </nav>

      <ProfileView userName={session.user?.name ?? 'Athlete'} email={session.user?.email ?? ''} />

      <BoostShelf shards={shards} owned={owned} />

      <section className="mt-10">
        <div className="flex items-center gap-2">
          <h2 className="fel-heading text-[19px] font-bold text-white">Your creator card</h2>
          <span className="rounded-full bg-[#A855F7]/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#C79BFF]">
            Shareable
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-white/40">
          Scanned by somebody new, it pays you both in shards.
        </p>
        <div className="mt-3"><CardEditor /></div>
      </section>

      <div className="mt-8"><ReferralCard /></div>
      <DoorsRow tab="profile" />
    </TabPage>
  );
}
