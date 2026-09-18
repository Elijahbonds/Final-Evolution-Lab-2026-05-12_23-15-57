export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isStudioCreatorEnabled, FEATURE_DISABLED } from '@/lib/flags';
import { resolveStudioTier, billingMonthKey } from '@/lib/studio-service';
import { generatePartnerKey, partnerMonthlyUnits } from '@/lib/partner-keys';
import { PARTNER_UNIT_COST } from '@/lib/studio-plan';

const ALLOWED_SCOPES = Object.keys(PARTNER_UNIT_COST);

/** GET /api/studio/partner-keys — list the caller's keys (masked) + this-month usage. */
export async function GET() {
  if (!isStudioCreatorEnabled()) return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const keys = await prisma.studioPartnerKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  const month = billingMonthKey();
  const withUsage = await Promise.all(
    keys.map(async (k) => ({
      id: k.id,
      name: k.name,
      hint: k.keyHint,
      scopes: k.scopes.split(',').map((s) => s.trim()).filter(Boolean),
      active: k.active && !k.revokedAt,
      monthlyQuota: k.monthlyQuota,
      unitsThisMonth: await partnerMonthlyUnits(k.id),
      month,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }))
  );
  return NextResponse.json({ keys: withUsage });
}

/**
 * POST /api/studio/partner-keys  { name?, scopes?[], monthlyQuota? }
 * Issues a new partner key. The raw key is returned ONCE and never stored.
 * Requires Creator/BYO tier.
 */
export async function POST(req: NextRequest) {
  if (!isStudioCreatorEnabled()) return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tier = await resolveStudioTier(userId);
  if (tier === 'FREE') {
    return NextResponse.json({ error: 'creator_required', message: 'A Creator subscription is required for partner API access.' }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? 'Partner key').slice(0, 80);
  let scopes: string[] = Array.isArray(body?.scopes) && body.scopes.length
    ? body.scopes.map((s: any) => String(s)).filter((s: string) => ALLOWED_SCOPES.includes(s))
    : ['build:read'];
  if (scopes.length === 0) scopes = ['build:read'];
  const monthlyQuota = body?.monthlyQuota !== undefined ? Math.max(-1, Math.round(Number(body.monthlyQuota) || 0)) : 1000;

  const { raw, hash, hint } = generatePartnerKey();
  const rec = await prisma.studioPartnerKey.create({
    data: { userId, name, keyHash: hash, keyHint: hint, scopes: scopes.join(','), monthlyQuota },
  });

  return NextResponse.json({
    id: rec.id,
    name: rec.name,
    scopes,
    monthlyQuota,
    // Shown exactly once. Not recoverable later.
    rawKey: raw,
    hint,
  });
}

/** DELETE /api/studio/partner-keys?id=... — revoke a key the caller owns. */
export async function DELETE(req: NextRequest) {
  if (!isStudioCreatorEnabled()) return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const rec = await prisma.studioPartnerKey.findFirst({ where: { id, userId } });
  if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await prisma.studioPartnerKey.update({
    where: { id },
    data: { active: false, revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true, revoked: id });
}
