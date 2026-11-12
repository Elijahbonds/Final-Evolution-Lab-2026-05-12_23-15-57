// lib/library/coachVideo.ts — COACH-DELIVERY COA-08 (2026-10-27; owner 2026-10-25 "demos = avatar + coach video"; 2026-10-20
// "own storage only"): a coach uploads their OWN demo video for one of their catalogue exercises, straight from the browser
// to FEL's own Google Cloud Storage with a signed, size-bound PUT (lib/coach/delivery/media.ts). The video lands in the
// existing PUBLIC creator-media bucket (CREATOR_MEDIA_PUBLIC_BUCKET) under coach-videos/<coachId>/, and its URL goes into the
// exercise's demo field, where Today, the library and the catalogue play it inline (autoplay, muted, looped).
//
// DARK UNTIL THE OWNER'S STEP (OWN-16): off unless COACH_VIDEO_UPLOADS_ENABLED is on AND the public bucket is set. Off, the
// catalogue form simply has no Upload button. assumption: a coach's demo video is public-read like the creator bucket's
// approved media (no review queue); an unguessable object name, the coach's own prefix, video types only.
import { randomUUID } from 'node:crypto';
import { bucketFrom } from '@/lib/coach/delivery/media';

type Env = Readonly<Record<string, string | undefined>>;

/** (new) The largest demo video a coach may upload: 60 MB (a short clip, phone quality). */
export const COACH_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
export const COACH_VIDEO_TYPES: Readonly<Record<string, string>> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
export const COACH_VIDEO_PREFIX = 'coach-videos/';

const on = (v: string | undefined) => v === 'true' || v === '1';

/** The bucket uploads go to, or null: off (the switch is off, or the bucket is not set). */
export function coachVideoBucket(env: Env = process.env): string | null {
  return on(env.COACH_VIDEO_UPLOADS_ENABLED) ? bucketFrom(env.CREATOR_MEDIA_PUBLIC_BUCKET) : null;
}

export function checkCoachVideo(contentType: unknown, bytes: unknown): { ok: true; ext: string } | { ok: false; error: 'video_type' | 'video_size' } {
  const ext = typeof contentType === 'string' ? COACH_VIDEO_TYPES[contentType] : undefined;
  if (!ext) return { ok: false, error: 'video_type' };
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 1 || bytes > COACH_VIDEO_MAX_BYTES) return { ok: false, error: 'video_size' };
  return { ok: true, ext };
}

export function coachVideoObject(coachId: string, ext: string): string {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(coachId) || !/^[a-z0-9]{2,5}$/.test(ext)) throw new Error('bad_object');
  return `${COACH_VIDEO_PREFIX}${coachId}/${randomUUID().replace(/-/g, '')}.${ext}`;
}
