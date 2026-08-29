import { NextResponse } from 'next/server';
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
    return NextResponse.json({ profile, prq: score, grade: prqGrade(score), role });
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
