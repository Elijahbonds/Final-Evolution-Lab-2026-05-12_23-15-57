import { NextResponse } from 'next/server';
import { readWallet } from '@/lib/wallet/wallet-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOrCreateProfile } from '@/lib/profile-service';
import { prqScore, prqGrade } from '@/lib/prq';
import { ROSTER } from '@/lib/game-data';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const profile = await getOrCreateProfile(userId);
    const score = prqScore(profile as any);
    const role = (session?.user as any)?.role ?? 'user';
    const wallet = await readWallet(prisma, userId);   // pass 5 phase 1: the wallet is the balance readers use
    // WHAT THE HEADER NEEDS TO SHOW THE RIGHT DOORS (2026-09-19). The coach product and the athlete's training
    // screen were reachable only by typing the URL, because nothing in the app knew whether you were a coach or
    // whether anybody was coaching you. Two booleans, read where the session already is.
    const [facilitator, coachedBy, coachesAnyone] = await Promise.all([
      prisma.facilitatorProfile.findUnique({ where: { userId }, select: { certificationStatus: true } }).catch(() => null),
      prisma.coachClient.findFirst({ where: { clientId: userId, endedAt: null }, select: { id: true } }).catch(() => null),
      prisma.coachClient.findFirst({ where: { coachId: userId, endedAt: null }, select: { id: true } }).catch(() => null),
    ]);
    const isCoach = facilitator?.certificationStatus === 'certified' || !!coachesAnyone;
    const hasCoach = !!coachedBy;
    return NextResponse.json({
      profile, wallet: { coins: wallet.coins, shards: wallet.shards, lc: wallet.lc },
      prq: score, grade: prqGrade(score), role, isCoach, hasCoach,
    });
  } catch (e) {
    console.error('profile error', e);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const avatarKey = String(body?.avatarKey ?? '');
    if (!ROSTER.some((r) => r.key === avatarKey)) {
      return NextResponse.json({ error: 'Invalid athlete selection' }, { status: 400 });
    }

    await getOrCreateProfile(userId);
    const profile = await prisma.playerProfile.update({ where: { userId }, data: { avatarKey } });
    const score = prqScore(profile as any);
    return NextResponse.json({ profile, prq: score, grade: prqGrade(score) });
  } catch (e) {
    console.error('profile patch error', e);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
