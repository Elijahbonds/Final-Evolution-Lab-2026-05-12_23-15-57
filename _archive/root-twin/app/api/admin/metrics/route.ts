/**
 * app/api/admin/metrics/route.ts
 * ==============================
 * M13 Step 5 — admin-only metrics. GET returns the stored daily rollups; POST
 * recomputes today's rollup on demand (so the dashboard can refresh without a
 * scheduled job). First-party data only.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { computeRollup, recomputeRecent } from '@/lib/metrics-rollup';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  return role === 'admin' ? (session!.user as any) : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rollups = await prisma.metricRollup.findMany({ orderBy: { day: 'desc' }, take: 30 });
  const live = await computeRollup(new Date());
  return NextResponse.json({ live, rollups: rollups.map((r) => ({ day: r.day, ...(r.payload as any) })) });
}

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const days = await recomputeRecent(14);
  return NextResponse.json({ ok: true, recomputed: days });
}
