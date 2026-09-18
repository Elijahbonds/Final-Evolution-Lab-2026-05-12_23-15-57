// Camp server helpers — shared by the /api/v1/camp/* routes. Thin: auth
// resolution, the facilitator upsert, and the certification recompute that
// every credential write must run (so status is never stale).
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { certificationStatusFor } from './certification';
import { CURRICULUM_VERSION } from '@/lib/curriculum/blueprint';

export async function currentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return ((session?.user as { id?: string } | undefined)?.id) ?? null;
}

export async function isOwner(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role === 'admin' || u?.role === 'owner';
}

/** Recompute and persist a facilitator's certification from their credentials. */
export async function recomputeCertification(userId: string) {
  const [creds, profile] = await Promise.all([
    prisma.credential.findMany({ where: { userId }, select: { trackKey: true, moduleKey: true, curriculumVersion: true, passed: true } }),
    prisma.facilitatorProfile.findUnique({ where: { userId } }),
  ]);
  const r = certificationStatusFor(creds, profile?.revokedAt ?? null);
  const certifiedAt = r.status === 'certified' ? (profile?.certifiedAt ?? new Date()) : profile?.certifiedAt ?? null;
  const saved = await prisma.facilitatorProfile.upsert({
    where: { userId },
    update: { certificationStatus: r.status, certifiedAt, curriculumVersion: r.status === 'certified' ? CURRICULUM_VERSION : profile?.curriculumVersion ?? null },
    create: { userId, certificationStatus: r.status, certifiedAt, curriculumVersion: r.status === 'certified' ? CURRICULUM_VERSION : null },
  });
  // The Facilitator Card IS the user's Creator Card with kind='facilitator'
  // (owner decision): certification flips it, anything else flips it back.
  const card = await prisma.creatorCard.findFirst({ where: { ownerId: userId }, select: { id: true, kind: true } });
  const wantKind = r.status === 'certified' ? 'facilitator' : 'athlete';
  if (card && card.kind !== wantKind) {
    await prisma.creatorCard.update({ where: { id: card.id }, data: { kind: wantKind } });
    if (wantKind === 'facilitator' && !saved.facilitatorCardId) await prisma.facilitatorProfile.update({ where: { userId }, data: { facilitatorCardId: card.id } });
  }
  return { ...r, profile: saved };
}

export function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

/**
 * The paid facilitator gate (2026-09-12).
 *
 * Certification says a facilitator is QUALIFIED; a subscription says the business is PAID FOR.
 * They are different questions and this asks the second, after the first.
 *
 * Deliberately NOT applied to consent or revoke. A guardian must always be able to record or
 * withdraw consent for a minor, and a credential must always be revocable, on any account, paid or
 * lapsed. Billing gates features; it must never gate a safeguarding control.
 */
export async function requirePaidFacilitator(userId: string): Promise<NextResponse | null> {
  const { isCoachUser, b2bPaywall, PAYWALL_STATUS } = await import('../pro-guard');
  if (await isCoachUser(userId)) return null;
  return NextResponse.json(
    b2bPaywall('Camp mentees, plans and assessments', 'coach',
      'Your own training, the Mirror and every game mode stay free. Consent records and credential revocation are never gated.'),
    { status: PAYWALL_STATUS },
  );
}
