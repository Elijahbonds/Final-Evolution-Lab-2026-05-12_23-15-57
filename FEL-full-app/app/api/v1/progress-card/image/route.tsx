// PROGRESS CARD — the week's share image (value round item 1; owner promise "get measurably better").
//
// The signed-in owner's OWN card only: there is no id or slug to ask for anyone else's. It is drawn from the rows the
// profile reads (lib/profile-v2/load.ts, one parallel batch), by the built-in next/og renderer the creator card's link
// preview already uses (no new dependency). Nothing is stored and nothing is posted: the page hands the PNG to the
// phone's share sheet, or saves it, and only when the owner taps (lib/capture/shareClip.ts deliverClip).
//
// TEENS PRIVATE BY DEFAULT (owner 2026-10-22): an under-18 or unknown-age account's image never carries a name, whatever
// `?name=` says; it has no face and no location for anyone (lib/progress-card/image.tsx). An adult's name is on it only
// when they tick it (`?name=1`); the default is off.
import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { readProfileRows, READ_CAP, type ProfileDb } from '@/lib/profile-v2/load';
import { buildProgressCard } from '@/lib/progress-card/card';
import { CARD_IMAGE, ProgressCardImage } from '@/lib/progress-card/image';

export const runtime = 'nodejs';
// a person's own numbers: drawn per request, never cached anywhere
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Images one account may draw per window: a draw is real CPU, and a person shares a week a few times at most (new). */
export const IMAGE_LIMIT = { count: 20, windowMs: 10 * 60_000 } as const;

// LOWER CASE ON PURPOSE: next/og's ImageResponse sets `cache-control: public, immutable, max-age=31536000` in production
// and spreads ours over it by key. 'Cache-Control' is a different key, so both survived and joined into one header that
// let a CDN keep a person's week for a year (caught by tests/progress-card/image-route.test.tsx).
const NO_STORE = { 'cache-control': 'private, no-store' };

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  const rl = rateLimit(`progress-card-image:${me}`, IMAGE_LIMIT.count, IMAGE_LIMIT.windowMs);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rl.retryAfterSec) } });

  const showName = new URL(req.url).searchParams.get('name') === '1';
  const now = new Date();
  const rows = await readProfileRows(prisma as unknown as ProfileDb, me, now);
  const card = buildProgressCard(me, rows, now, READ_CAP.played);
  return new ImageResponse(<ProgressCardImage card={card} opts={{ showName }} />, { ...CARD_IMAGE, headers: NO_STORE });
}
