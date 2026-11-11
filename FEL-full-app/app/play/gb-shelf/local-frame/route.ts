import { getServerSession } from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isBinjgbLocalFileEnabled, isBinjgbShelfEnabled } from '@/lib/flags';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { siteOrigin } from '@/lib/stripe/site-origin';
import { localFrameAllowed } from '@/lib/binjgb/gate';
import { frameDocument } from '@/lib/binjgb/frameDoc';

export const dynamic = 'force-dynamic';

const notFound = () => new NextResponse(null, { status: 404 });

/**
 * BINJGB-SHELF-1 load-your-own: the sandboxed frame's document (OQ-6: under /play/gb-shelf, no /play/gb-local route).
 * 404 unless BOTH flags are on AND the signed-in account is a verified adult (L1, read from the database) — the same
 * rule that decides whether the shelf renders the picker. The frame's CSP (frame-ancestors 'self', nonce, wasm) comes
 * from middleware.ts's per-route table; the nonce arrives on the request as x-nonce. The app origin it trusts comes from
 * NEXTAUTH_URL (lib/stripe/site-origin.ts), never from a request header; unset → 404.
 */
export async function GET(req: NextRequest) {
  if (!isBinjgbShelfEnabled() || !isBinjgbLocalFileEnabled()) return notFound();
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) return notFound();
  const dobYear = await readDobYear(prisma, me, 'gb_local_frame');
  if (!localFrameAllowed({ shelfOn: true, localOn: true, dobYear })) return notFound();
  const site = siteOrigin();
  let origin: string | null = null;
  try { origin = site ? new URL(site).origin : null; } catch { origin = null; }
  const html = origin ? frameDocument(req.headers.get('x-nonce') ?? '', origin) : null;
  if (!html) return notFound();
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
