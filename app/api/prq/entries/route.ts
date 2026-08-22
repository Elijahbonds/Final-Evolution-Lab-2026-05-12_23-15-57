/**
 * GET  /api/prq/entries — list PRQ entries (recent first)
 * POST /api/prq/entries — manual entry (source=manual, server-enforced)
 *
 * The client cannot set source=drillResult or source=device here.
 * drillResult entries are created by the session-result path only.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PRQ_ATTRS } from '@/lib/prq';
import { createPrqEntry, listPrqEntries, ATTR_UNITS } from '@/lib/prq-entries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const entries = await listPrqEntries(prisma, userId, { limit: 200 });
    return NextResponse.json({ entries });
  } catch (e) {
    console.error('prq/entries GET error', e);
    return NextResponse.json({ error: 'Failed to load entries' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const attribute = String(body?.attribute ?? '');
    const value = Number(body?.value);
    const unit = String(body?.unit ?? '');
    const measuredAtStr = body?.measuredAt;

    // Validate attribute
    if (!PRQ_ATTRS.includes(attribute as any)) {
      return NextResponse.json({ error: 'Invalid attribute' }, { status: 400 });
    }
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: 'Value must be a non-negative number' }, { status: 400 });
    }
    if (!unit) {
      return NextResponse.json({ error: 'Unit is required' }, { status: 400 });
    }

    // Validate unit against allowed list
    const allowed = ATTR_UNITS[attribute as keyof typeof ATTR_UNITS];
    if (allowed && !allowed.includes(unit)) {
      return NextResponse.json({ error: `Invalid unit for ${attribute}. Allowed: ${allowed.join(', ')}` }, { status: 400 });
    }

    const measuredAt = measuredAtStr ? new Date(measuredAtStr) : new Date();
    if (isNaN(measuredAt.getTime())) {
      return NextResponse.json({ error: 'Invalid measuredAt date' }, { status: 400 });
    }
    // Don’t accept future dates
    if (measuredAt.getTime() > Date.now() + 60_000) {
      return NextResponse.json({ error: 'measuredAt cannot be in the future' }, { status: 400 });
    }

    // Source is ALWAYS manual for this endpoint. The client cannot override.
    const entry = await createPrqEntry(prisma, {
      userId,
      attribute: attribute as any,
      value,
      unit,
      source: 'manual',
      measuredAt,
    });

    return NextResponse.json({ ok: true, entryId: entry.id });
  } catch (e: any) {
    console.error('prq/entries POST error', e);
    return NextResponse.json({ error: e?.message ?? 'Failed to create entry' }, { status: 400 });
  }
}
