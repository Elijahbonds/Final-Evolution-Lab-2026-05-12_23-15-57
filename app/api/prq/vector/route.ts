/**
 * GET /api/prq/vector — the honest PRQ attribute vector.
 *
 * Returns the latest entry per attribute, with source + measuredAt.
 * Unmeasured attributes are absent from the map (null in the UI = “not measured”).
 * Also returns the traceable composite PRQ score.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PRQ_ATTRS } from '@/lib/prq';
import { getLatestPrqVector, computeTraceablePrq, ATTR_LABELS, ATTR_UNITS } from '@/lib/prq-entries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [vec, prq] = await Promise.all([
      getLatestPrqVector(prisma, userId),
      computeTraceablePrq(prisma, userId),
    ]);

    // Build the full vector with null for unmeasured attrs
    const attributes = PRQ_ATTRS.map((attr) => {
      const entry = vec.get(attr);
      return {
        key: attr,
        label: ATTR_LABELS[attr],
        units: ATTR_UNITS[attr],
        measured: entry
          ? {
              value: entry.value,
              unit: entry.unit,
              source: entry.source,
              measuredAt: entry.measuredAt,
              entryId: entry.entryId,
            }
          : null,
      };
    });

    return NextResponse.json({
      attributes,
      prq: prq.score,
      measuredCount: prq.measured,
      totalAttributes: prq.total,
    });
  } catch (e) {
    console.error('prq/vector error', e);
    return NextResponse.json({ error: 'Failed to load PRQ vector' }, { status: 500 });
  }
}
