export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { clientKeyFromHeaders, rateLimit } from '@/lib/rate-limit';
import { issueBookFile } from '@/lib/books/bookDelivery';
import { claimBookEntitlements, normalizeBookEmail, readReaderGrant } from '@/lib/books/bookEntitlements';
import { prismaBookStore } from '@/lib/books/bookStore';
import { bookStorageConfig, signGcsV4, signedUrlTtl } from '@/lib/books/bookStorage';

/**
 * POST /api/books/download
 * Body: { bookSlug, fileId, grant? }
 * A logged-in owner, a receipt grant, or a catalog sample. The signer runs
 * only after issueBookFile allows the file. Paths come from the catalog.
 */
export async function POST(req: NextRequest) {
  const ip = clientKeyFromHeaders(req.headers);
  const limited = rateLimit(`books-download:${ip}`, 120, 10 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const bookSlug = typeof body?.bookSlug === 'string' ? body.bookSlug.slice(0, 80) : '';
  const fileId = typeof body?.fileId === 'string' ? body.fileId.slice(0, 80) : '';
  const grant = typeof body?.grant === 'string' ? body.grant.slice(0, 500) : '';

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const sessionEmail = session?.user?.email ? normalizeBookEmail(session.user.email) : null;
  const grantEmail = grant && process.env.NEXTAUTH_SECRET
    ? readReaderGrant(process.env.NEXTAUTH_SECRET, grant)?.email ?? null
    : null;
  const email = sessionEmail || grantEmail;

  if (!userId && !email) {
    // Samples still resolve inside the gate. Everything else is a 403 from the gate
    // once we know the file, which is a better answer than a blanket 401.
  }

  const store = prismaBookStore();
  let entitlements: { bookSlug: string; format: string; status: string }[] = [];
  if (userId || email) {
    try {
      if (userId && email) await claimBookEntitlements(store, userId, email);
      entitlements = await store.listActive({ userId, email });
    } catch (err) {
      console.error('[books-download] entitlement lookup failed', err);
      return NextResponse.json({ error: 'Library is unavailable right now.' }, { status: 503 });
    }
  }

  let result;
  try {
    result = await issueBookFile(
      { bookSlug, fileId, entitlements },
      {
        ttlSeconds: signedUrlTtl(),
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
      return NextResponse.json({ error: 'Book files are not configured yet.' }, { status: 503 });
    }
    console.error('[books-download] sign failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not prepare that file.' }, { status: 500 });
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: result.url, expiresIn: result.expiresIn });
}
