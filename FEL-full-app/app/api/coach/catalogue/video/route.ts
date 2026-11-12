export const dynamic = 'force-dynamic';
import { NextResponse, type NextRequest } from 'next/server';
import { currentUserId, bad } from '@/lib/camp/server';
import { isCertifiedCoach } from '@/lib/coach/server';
import { signOwnPut, UploadsComingSoon } from '@/lib/coach/delivery/media';
import { checkCoachVideo, coachVideoBucket, coachVideoObject } from '@/lib/library/coachVideo';

/**
 * COACH-DELIVERY COA-08 (2026-10-27): a coach's own demo video, uploaded to FEL's own storage (lib/library/coachVideo.ts).
 *   GET   { on } — whether uploads are on (COACH_VIDEO_UPLOADS_ENABLED and CREATOR_MEDIA_PUBLIC_BUCKET; OWN-16)
 *   POST  { contentType, bytes } — a certified coach gets a signed PUT for exactly that file, and the URL it will have; the
 *         form puts that URL in the exercise's demo field and saves the row as usual. Off → 503 uploads_off.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  return NextResponse.json({ on: !!coachVideoBucket() });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  if (!(await isCertifiedCoach(userId))) return bad('facilitator_not_certified', 403);
  const bucket = coachVideoBucket();
  if (!bucket) return bad('uploads_off', 503);
  const body = (await req.json().catch(() => null)) as { contentType?: unknown; bytes?: unknown } | null;
  const c = checkCoachVideo(body?.contentType, body?.bytes);
  if (!c.ok) return bad(c.error, 400);
  try {
    const put = await signOwnPut({ bucket, objectName: coachVideoObject(userId, c.ext), contentType: String(body!.contentType), bytes: Number(body!.bytes) });
    return NextResponse.json({ put: { url: put.url, headers: put.headers }, url: put.objectUrl });
  } catch (e) {
    if (e instanceof UploadsComingSoon) return bad('uploads_off', 503);
    throw e;
  }
}
