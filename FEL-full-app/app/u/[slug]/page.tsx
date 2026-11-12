import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadProfile, type ProfileDb } from '@/lib/profile-v2/load';
import { canViewProfile, effectiveVisibility } from '@/lib/profile-v2/visibility';
import { isValidSlug } from '@/lib/creator/card-core';
import { redactForViewer } from '@/lib/profile-v2/viewer';
import { areSquadmates, type RawDb } from '@/lib/groups/store';
import { TabPage } from '@/components/shell/tab-page';
import { ProgressHeader } from '@/components/profile-v2/progress-header';
import { StatsSection } from '@/components/profile-v2/stats-section';
import { BadgesSection } from '@/components/profile-v2/badges-section';
import { HighlightsSection } from '@/components/profile-v2/highlights-section';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// A profile is never indexed: a public one is shared by its owner, not found by a search engine.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * SOMEONE ELSE'S PROFILE (PROFILE V2, owner 2026-10-24: "friends only, and teens private"). The handle is the one FEL
 * already has: the creator card's slug. lib/profile-v2/visibility.ts decides — the owner, their coach (a live
 * CoachClient), or anyone when an ADULT owner chose public (the card's published flag). An under-18 or unknown-age owner
 * is never public. Every refusal is the same 404 as a slug that does not exist, so the page says nothing about whether
 * an account is there. What an allowed viewer sees is lib/profile-v2/viewer.ts.
 */
export default async function ViewProfilePage({ params }: { params: { slug: string } }) {
  const slug = String(params?.slug ?? '').toLowerCase();
  if (!isValidSlug(slug)) notFound();
  const [card, session] = await Promise.all([
    prisma.creatorCard.findUnique({ where: { slug }, select: { ownerId: true, published: true, showStats: true } }).catch(() => null),
    getServerSession(authOptions),
  ]);
  if (!card) notFound();
  const viewerId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [owner, coachLink, squadmate] = await Promise.all([
    prisma.user.findUnique({ where: { id: card.ownerId }, select: { dobYear: true } }).catch(() => null),
    viewerId ? prisma.coachClient.findFirst({ where: { coachId: viewerId, clientId: card.ownerId, endedAt: null }, select: { id: true } }).catch(() => null) : null,
    // TEAMS-SQUADS: friends are squadmates (no separate friends graph); false until the pending SQL is applied
    viewerId ? areSquadmates(prisma as unknown as RawDb, viewerId, card.ownerId).catch(() => false) : false,
  ]);
  if (!owner) notFound();
  const answer = canViewProfile({
    viewerId, ownerId: card.ownerId, ownerDobYear: owner.dobYear, ownerChosePublic: card.published,
    viewerCoachesOwner: !!coachLink, viewerIsFriend: squadmate,
  });
  if (!answer.allowed) notFound();
  // The owner sees what others see: the public view when they chose public, otherwise what their coach sees.
  const self = answer.as === 'self';
  const as = answer.as === 'self' ? (effectiveVisibility(owner.dobYear, card.published) === 'public' ? 'public' : 'coach') : answer.as;

  const data = redactForViewer(await loadProfile(prisma as unknown as ProfileDb, card.ownerId), as, card.showStats);
  return (
    <TabPage eyebrow={answer.as === 'coach' ? 'Your athlete' : 'Profile'} title={data.identity.name} accent="#FFD700">
      {self && (
        <p className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[12px] text-white/60">
          This is how {as === 'public' ? 'anyone with your link' : 'your coaches'} see{as === 'public' ? 's' : ''} your profile. <Link href="/profile" className="font-bold text-[#00E5FF] underline-offset-2 hover:underline">Back to yours</Link>
        </p>
      )}
      <ProgressHeader data={data} viewer />
      <StatsSection data={data} viewer />
      <BadgesSection data={data} viewer />
      <HighlightsSection data={data} viewer />
    </TabPage>
  );
}
