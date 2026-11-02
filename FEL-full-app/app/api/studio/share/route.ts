import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { isStudioShareEnabled } from '@/lib/flags';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { studioAudienceOk, studioNotFound } from '@/lib/nexus-studio/audience';
import { createShareLink, listShareLinks, shareMakerAllowed } from '@/lib/nexus-studio/share';
import type { PhoneSample } from '@/lib/nexus-studio/publishGate';

export const dynamic = 'force-dynamic';

/**
 * NEX-06 (lib/nexus-studio/share.ts): a creator's Studio venue as a share link.
 *   POST { venue: StudioVenueExport, phone: { drawCalls, activeMeshes, textureMb, skinnedBodies } }  →  { id, url, mode }
 *   GET                                                                                               →  { links: MyShare[] }
 * In order: STUDIO_SHARE_ENABLED (off: 404) → signed in (401) → the Studio's audience, the role read from the database (404, NEX-01)
 * → POST only: the maker rule (the owner's roles, or a verified adult; a teen builds but stays private: 403) → a per-account
 * burst limit → a capped body → the sanitiser, the publish gate and the text screen (422 with every reason) → the pending table
 * (503 share_not_ready until the owner applies its SQL). The token is in the URL returned ONCE; only its hash is stored.
 */
export async function POST(req: Request) {
  if (!isStudioShareEnabled()) return studioNotFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await studioAudienceOk(prisma, userId))) return studioNotFound();
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, dobYear: true, name: true } }).catch(() => null);
  const may = shareMakerAllowed(me?.role, me?.dobYear);
  if (may !== 'ok') return NextResponse.json({ error: 'share_adults_only', message: 'Share links are for adults. Your venues stay in your Studio.' }, { status: 403 });
  const rl = rateLimit(`studio-share:${userId}`, 6, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  const text = await req.text().catch(() => '');
  if (text.length > 400_000) return NextResponse.json({ error: 'body_too_large' }, { status: 413 });
  let body: { venue?: unknown; phone?: unknown } = {};
  try { body = JSON.parse(text) ?? {}; } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const p = body.phone && typeof body.phone === 'object' ? body.phone as Record<string, unknown> : null;
  const phone: PhoneSample | null = p ? { drawCalls: Number(p.drawCalls), activeMeshes: Number(p.activeMeshes), textureMb: Number(p.textureMb), skinnedBodies: Number(p.skinnedBodies) } : null;
  const r = await createShareLink(prisma as unknown as RawDb, { creatorId: userId, creatorName: me?.name ?? null, venue: body.venue, phone });
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.problems ? { problems: r.problems } : {}) }, { status: r.status });
  return NextResponse.json({ id: r.value.id, mode: r.value.mode, url: `/play/shared/${r.value.token}` }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  if (!isStudioShareEnabled()) return studioNotFound();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await studioAudienceOk(prisma, userId))) return studioNotFound();
  const r = await listShareLinks(prisma as unknown as RawDb, userId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ links: r.value }, { headers: { 'Cache-Control': 'no-store' } });
}
