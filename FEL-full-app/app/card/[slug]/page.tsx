import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getPublicCard } from '@/lib/creator/card-service';
import { CreatorCard } from '@/components/creator/creator-card';
import { Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const card = await getPublicCard(prisma, String(params?.slug ?? '').toLowerCase());
  if (!card) return { title: 'Card not found — Final Evolution Lab' };
  return {
    title: `${card.displayName} — FEL Creator Card`,
    description: card.tagline ?? `${card.displayName}'s athlete card on Final Evolution Lab.`,
  };
}

export default async function CardPage({ params }: { params: { slug: string } }) {
  const slug = String(params?.slug ?? '').toLowerCase();
  const card = await getPublicCard(prisma, slug);
  if (!card) notFound();

  return (
    <div className="min-h-screen bg-[#050505]">
      <div className="mx-auto flex max-w-[900px] flex-col items-center px-4 py-12">
        <Link href="/" className="fel-heading text-xl font-bold text-white">
          FINAL <span className="text-[#00E5FF]">EVOLUTION</span> LAB
        </Link>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-white/40">Creator Card</p>

        <div className="mt-8">
          <CreatorCard card={card} />
        </div>

        <Link
          href="/signup"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-[#050505] transition-transform hover:scale-[1.03]"
        >
          <Sparkles className="h-4 w-4" /> Build your own card
        </Link>
        <p className="mt-3 text-xs text-white/40">Train across {card.wins >= 0 ? '20+' : '20+'} modes. Earn your rarity.</p>
      </div>
    </div>
  );
}
