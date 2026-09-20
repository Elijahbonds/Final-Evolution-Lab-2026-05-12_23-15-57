import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getPublicCard } from '@/lib/creator/card-service';
import { publicStatsFor } from '@/lib/creator/card-stats-server';
import type { Highlight } from '@/lib/creator/card-stats';
import { CreatorCard } from '@/components/creator/creator-card';
import { CardShare } from '@/components/creator/card-share';
import { CardProgressionPanel } from '@/components/creator/card-progression';
import { progressionFor } from '@/lib/creator/cardProgression-server';
import { ensureReferralCode } from '@/lib/marketing/referral';
import { signupPathFor } from '@/lib/creator/share-link';
import { DEFAULT_REWARD_RULES, REASON } from '@/lib/wallet/reward-rules';
import { Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const card = await getPublicCard(prisma, String(params?.slug ?? '').toLowerCase());
  if (!card) return { title: 'Card not found — Final Evolution Lab' };
  return {
    title: `${card.displayName} — FEL Creator Card`,
    description: card.tagline ?? `${card.displayName}'s athlete card on Final Evolution Lab.`,
    // link-in-bio shares render the card's own face on social platforms
    openGraph: {
      title: `${card.displayName} — FEL Creator Card`,
      description: card.tagline ?? `${card.displayName}'s athlete card on Final Evolution Lab.`,
      type: 'profile',
    },
  };
}

export default async function CardPage({ params }: { params: { slug: string } }) {
  const slug = String(params?.slug ?? '').toLowerCase();
  const card = await getPublicCard(prisma, slug);
  if (!card) notFound();
  // lane 5: the scouting blocks, masked by the owner
  const { stats, visibility } = await publicStatsFor(card.ownerId, card.showStats);
  const highlights = visibility.highlights ? ((card.highlights ?? []) as unknown as Highlight[]) : [];
  // build-order item 8: the progression read surface. Null for a minor, and null when there is nothing
  // measured, earned or cleared — an empty "Progression" heading is worse than no heading.
  const progression = await progressionFor(prisma, card.ownerId);
  // THE CARD IS THE REFERRAL (owner, 2026-09-19: "whoever card gets scanned and a new account is created they get
  // shards — with a QR code"). Every piece of that already existed and none of them were joined up: signup takes a
  // ?ref=CODE, convertReferralOnSignup pays the code's owner, and the card had a QR — of a URL with no code in it. So
  // a sticker could be scanned, land on the card, make an account, and pay its owner nothing. The code goes in the QR,
  // the copy link and the CTA now, so the scan carries the attribution the rest of the chain is waiting for.
  const refCode = await ensureReferralCode(prisma, card.ownerId).catch(() => null);
  const refShards = DEFAULT_REWARD_RULES[REASON.REFERRAL_BONUS]?.baseAmount ?? 0;

  return (
    <div className="min-h-screen bg-[#050505]">
      <div className="mx-auto flex max-w-[900px] flex-col items-center px-4 py-12">
        <Link href="/" className="fel-heading text-xl font-bold text-white">
          FINAL <span className="text-[#00E5FF]">EVOLUTION</span> LAB
        </Link>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-white/40">Creator Card</p>

        <div className="mt-8">
          <CreatorCard
            card={{
              ...card,
              ownerLook: card.owner?.profile
                ? { avatarKey: card.owner.profile.avatarKey, cosmeticAssetId: card.owner.profile.cosmeticAssetId }
                : null,
            }}
            stats={stats}
            highlights={highlights}
          />
        </div>

        {progression && <CardProgressionPanel progression={progression} accent={card.accent} />}

        {/* the share surface: bio link + QR (stickers/flyers) */}
        <CardShare slug={card.slug} accent={card.accent} refCode={refCode} refShards={refShards} />

        <Link
          href={signupPathFor(refCode)}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-[#050505] transition-transform hover:scale-[1.03]"
        >
          <Sparkles className="h-4 w-4" /> Build your own card
        </Link>
        <p className="mt-3 text-xs text-white/40">Train across {card.wins >= 0 ? '20+' : '20+'} modes. Earn your rarity.</p>
      </div>
    </div>
  );
}
