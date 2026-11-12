export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { brandingAct, brandingBoard, type BrandingDb } from '@/lib/coach/brandingServer';

/**
 * COACH-DELIVERY COA-04 (2026-10-26): the coach's brand (lib/coach/brandingServer.ts) — a name, an accent colour (readable on
 * FEL's dark background) and a logo in the existing public creator bucket. Certified coaches only.
 *   GET   their brand, and whether logo uploads are on (CREATOR_MEDIA_PUBLIC_BUCKET set)
 *   POST  { action: 'save', name?, accent? } | { action: 'logo_upload', contentType, bytes } | { action: 'logo_set', objectName }
 *         | { action: 'logo_clear' }
 * Before prisma/pending/2026-10-26-coach-delivery.sql is applied: GET { available: false }, POST 503.
 */
const db = () => prisma as unknown as BrandingDb;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await brandingBoard(db(), userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  const r = await brandingAct(db(), userId, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
