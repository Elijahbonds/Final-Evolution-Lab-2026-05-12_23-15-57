export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generatePresignedUploadUrl, getFileUrl } from '@/lib/s3';

// Music stems + acting audio are user-generated content meant to play in-game,
// so they are stored as PUBLIC objects. Cards still gate on pending_review.
const ALLOWED = new Set(['audio/wav', 'audio/webm', 'image/png', 'image/jpeg']);

/**
 * POST /api/v1/creative-card/upload-url  { fileName, contentType }
 * Returns a presigned PUT url + the cloud_storage_path + the eventual public url.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { fileName?: string; contentType?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const contentType = body.contentType ?? '';
  const fileName = (body.fileName ?? 'clip').replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json({ error: 'unsupported content type' }, { status: 422 });
  }

  const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
    `${userId}-${fileName}`, contentType, true,
  );
  const publicUrl = await getFileUrl(cloud_storage_path, contentType, true);
  return NextResponse.json({ uploadUrl, cloud_storage_path, publicUrl });
}
