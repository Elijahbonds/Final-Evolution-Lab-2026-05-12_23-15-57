export const dynamic = 'force-dynamic';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { ownerIsPublicCreator } from '@/lib/creator/creative-card-review';
import { checkUpload, pendingObjectName, signCreatorPut, UploadsComingSoon } from '@/lib/soundtrack/storage';

/** owner-facing limit: a creator publishing a song with its cover and a few stems stays well under this. */
const UPLOAD_RATE = { limit: 24, windowMs: 10 * 60_000 } as const;

/**
 * POST /api/v1/creative-card/upload-url  { fileName, contentType, bytes, durationSec? }
 *   → { uploadUrl, headers, objectName, publicUrl }
 *
 * CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06). Before: a presigned S3 PUT of ANY size, stored as a PUBLIC object before
 * anyone reviewed it, with no rate limit and no age check — a minor's voice line went public on upload. Now:
 *  - storage is Google Cloud Storage, PRIVATE until approved (lib/soundtrack/storage.ts): the object lands under
 *    pending/<userId>/ in CREATOR_MEDIA_BUCKET, and only an approval copies it to the public bucket. `publicUrl` (the name
 *    the /create client already reads) is that pending object's address: what the card stores, readable by nobody until
 *    the approval maps it to its public copy (stats.publicMedia).
 *  - the size is bound into the signature (`bytes` exactly; audio up to 8 MB and 4 minutes, images up to 2 MB). The client
 *    must send the returned `headers` with its PUT.
 *  - 24 signs per 10 minutes per account (a song, its cover and up to 16 stems fit, with a retry or two).
 *  - uploads are for public creators only (verified 18+). Owner: "teens create but nothing of theirs is public"; a teen's
 *    work stays on the device, as their Closet look does (lib/creator/lookPrivacy.ts).
 *  - no bucket configured → 503 "uploads coming soon" (fail closed).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rl = rateLimit(`creative-upload:${userId}`, UPLOAD_RATE.limit, UPLOAD_RATE.windowMs);
  if (!rl.ok) return NextResponse.json({ error: 'too many uploads, try again soon' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });

  let body: { fileName?: unknown; contentType?: unknown; bytes?: unknown; durationSec?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const chk = checkUpload({ contentType: body?.contentType, bytes: body?.bytes, durationSec: body?.durationSec });
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: 422 });

  if (!(await ownerIsPublicCreator(prisma, userId))) {
    return NextResponse.json({
      error: 'device_only',
      message: 'Uploads are for creators 18 and over. Your work stays on this device.',
    }, { status: 403 });
  }

  try {
    const objectName = pendingObjectName(userId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80), randomUUID().replace(/-/g, ''), chk.ext);
    const signed = await signCreatorPut({ objectName, contentType: body.contentType as string, bytes: body.bytes as number });
    return NextResponse.json({ uploadUrl: signed.url, headers: signed.headers, objectName, publicUrl: signed.pendingUrl });
  } catch (e) {
    if (e instanceof UploadsComingSoon) return NextResponse.json({ error: 'uploads_coming_soon' }, { status: 503 });
    console.error('[FEL-CREATIVE] upload sign failed', e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
