export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import { getBookFile } from '@/lib/books/bookCatalog';
import { issueBookStream } from '@/lib/books/bookDelivery';
import { claimBookEntitlements, normalizeBookEmail } from '@/lib/books/bookEntitlements';
import { bookShopClosedReason } from '@/lib/books/bookShop';
import { BookTablesNotReady, prismaBookStore } from '@/lib/books/bookStore';
import { bookStorageConfig, signGcsV4 } from '@/lib/books/bookStorage';
import { isVerifiedAdult } from '@/lib/coach-store/adult';
import { storeClosed } from '@/lib/coach-store/gate';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * POST /api/books/stream
 * Body: { bookSlug, fileId }
 * The audiobook player's door (owner 2026-10-13: stream only, no download). It answers ONE short-lived signed URL for
 * ONE chapter, per play, with `Content-Disposition: inline` and no filename (issueBookStream). It never returns a
 * file, an attachment or a download URL, and the page source never holds a URL before Play.
 *
 * Same order as the rest of the shop (lib/books/bookCheckoutRoute.test.ts):
 *   1. shop switched off (BOOK_STORE_ENABLED / VIRTUAL_PURCHASES_ENABLED) -> 409 store_closed
 *   2. not signed in   -> 401 unauthorized (no guest listening)
 *   3. not a verified adult (isVerifiedAdult; unknown age is not an adult) -> 403 adults_only
 *   4. not an owner of the audiobook -> 403; book tables not set up -> 503 "Library is unavailable right now."
 * The catalog's free sample chapter is the one exception: it is not a sale, so it streams without a sign-in, an age
 * check or the switches (as it did before this route existed).
 * The terms rule (lib/books/bookTerms.ts) is checked inside issueBookStream.
 */
export async function POST(req: NextRequest) {
  const ip = clientKeyFromHeaders(req.headers);
  const limited = rateLimit(`books-stream:${ip}`, 240, 10 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec), ...NO_STORE } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const bookSlug = typeof body?.bookSlug === 'string' ? body.bookSlug.slice(0, 80) : '';
  const fileId = typeof body?.fileId === 'string' ? body.fileId.slice(0, 80) : '';
  const isSample = Boolean(getBookFile(bookSlug, fileId)?.sample);

  let entitlements: { bookSlug: string; format: string; status: string }[] = [];

  if (!isSample) {
    const closed = bookShopClosedReason();
    if (closed) return storeClosed(closed);

    let userId: string | null = null;
    let email: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      userId = (session?.user as { id?: string } | undefined)?.id || null;
      email = session?.user?.email ? normalizeBookEmail(session.user.email) : null;
    } catch (err) {
      console.error('[books-stream] session lookup failed', err);
    }
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

    if (!(await isVerifiedAdult(prisma, userId))) {
      return NextResponse.json({ error: 'adults_only' }, { status: 403, headers: NO_STORE });
    }

    try {
      const store = prismaBookStore();
      if (email) await claimBookEntitlements(store, userId, email);
      entitlements = await store.listActive({ userId, email });
    } catch (err) {
      if (!(err instanceof BookTablesNotReady)) console.error('[books-stream] entitlement lookup failed', err);
      return NextResponse.json({ error: 'Library is unavailable right now.' }, { status: 503, headers: NO_STORE });
    }
  }

  let result;
  try {
    result = await issueBookStream(
      { bookSlug, fileId, entitlements },
      {
        sign: async (request) => {
          const cfg = bookStorageConfig();
          if (!cfg) {
            const missing = new Error('storage_not_configured');
            missing.name = 'StorageNotConfigured';
            throw missing;
          }
          return signGcsV4({
            bucket: cfg.bucket,
            objectPath: request.storagePath,
            clientEmail: cfg.clientEmail,
            privateKey: cfg.privateKey,
            ttlSeconds: request.ttlSeconds,
            contentType: request.contentType,
            disposition: request.disposition,
            downloadName: request.downloadName,
          });
        },
      },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'StorageNotConfigured') {
      return NextResponse.json({ error: 'Book files are not configured yet.' }, { status: 503, headers: NO_STORE });
    }
    console.error('[books-stream] sign failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not prepare that file.' }, { status: 500, headers: NO_STORE });
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE });
  return NextResponse.json({ url: result.url, expiresIn: result.expiresIn }, { headers: NO_STORE });
}
