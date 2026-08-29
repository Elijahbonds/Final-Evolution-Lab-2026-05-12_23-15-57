export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isStudioCreatorEnabled, FEATURE_DISABLED } from '@/lib/flags';
import {
  authenticatePartnerKey,
  bearerFrom,
  unitsForScope,
  partnerMonthlyUnits,
  recordPartnerUsage,
} from '@/lib/partner-keys';

/**
 * GET /api/partner/v1/catalog
 * Public partner API: authenticated by a bearer partner key. Returns the
 * KEY OWNER's published cartridges. Every call is metered against the key's
 * monthly quota; quota exhaustion returns 429.
 *
 * Auth: Authorization: Bearer nxk_live_...
 */
export async function GET(req: NextRequest) {
  if (!isStudioCreatorEnabled()) return NextResponse.json(FEATURE_DISABLED, { status: 403 });

  const raw = bearerFrom(req.headers.get('authorization'));
  const key = await authenticatePartnerKey(raw);
  if (!key) return NextResponse.json({ error: 'invalid_partner_key' }, { status: 401 });

  const scope = 'catalog:read';
  if (!key.scopes.includes(scope) && !key.scopes.includes('build:read')) {
    await recordPartnerUsage(key.id, { endpoint: scope, units: 0, status: 403 });
    return NextResponse.json({ error: 'insufficient_scope', required: scope }, { status: 403 });
  }

  const units = unitsForScope(scope);

  // Monthly quota enforcement.
  if (key.monthlyQuota >= 0) {
    const used = await partnerMonthlyUnits(key.id);
    if (used + units > key.monthlyQuota) {
      await recordPartnerUsage(key.id, { endpoint: scope, units: 0, status: 429 });
      return NextResponse.json(
        { error: 'quota_exceeded', monthlyQuota: key.monthlyQuota, used },
        { status: 429, headers: { 'X-Quota-Limit': String(key.monthlyQuota), 'X-Quota-Used': String(used) } }
      );
    }
  }

  const rows = await prisma.marketplaceListing.findMany({
    where: { creatorId: key.userId, listingType: 'CARTRIDGE', active: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  await recordPartnerUsage(key.id, { endpoint: scope, units, status: 200 });

  const usedAfter = await partnerMonthlyUnits(key.id);
  return NextResponse.json(
    {
      cartridges: rows.map((l) => ({
        id: l.id,
        title: l.title,
        itemKey: l.itemKey,
        version: l.version,
        priceUsdCents: l.priceUsd,
        updatedAt: l.updatedAt,
      })),
    },
    {
      headers: key.monthlyQuota >= 0
        ? { 'X-Quota-Limit': String(key.monthlyQuota), 'X-Quota-Used': String(usedAfter) }
        : {},
    }
  );
}
