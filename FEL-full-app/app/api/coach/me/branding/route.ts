export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { myBranding, type BrandingDb } from '@/lib/coach/brandingServer';

/** COACH-DELIVERY COA-04: the brand an athlete sees on Today — their newest active program's coach's, if any. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await myBranding(prisma as unknown as BrandingDb, userId);
  return NextResponse.json(r.body, { status: r.status });
}
