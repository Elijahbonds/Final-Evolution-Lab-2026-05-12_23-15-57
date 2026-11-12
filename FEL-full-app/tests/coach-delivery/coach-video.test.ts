// COACH-DELIVERY COA-08 (2026-10-27): a coach's own demo video into FEL's own storage — dark until the switch AND the bucket.
import { describe, expect, it } from 'vitest';
import { checkCoachVideo, coachVideoBucket, coachVideoObject, COACH_VIDEO_MAX_BYTES } from '@/lib/library/coachVideo';
import { signOwnPut, UploadsComingSoon } from '@/lib/coach/delivery/media';

describe('coach video upload', () => {
  it('is off unless the switch is on and the public bucket is set (OWN-16)', () => {
    expect(coachVideoBucket({})).toBeNull();
    expect(coachVideoBucket({ COACH_VIDEO_UPLOADS_ENABLED: 'true' })).toBeNull();
    expect(coachVideoBucket({ CREATOR_MEDIA_PUBLIC_BUCKET: 'fel-public' })).toBeNull();
    expect(coachVideoBucket({ COACH_VIDEO_UPLOADS_ENABLED: 'true', CREATOR_MEDIA_PUBLIC_BUCKET: 'fel-public' })).toBe('fel-public');
  });
  it('video types only, bounded size, under the coach\'s own prefix', () => {
    expect(checkCoachVideo('video/mp4', 5_000_000)).toEqual({ ok: true, ext: 'mp4' });
    expect(checkCoachVideo('image/png', 5_000)).toEqual({ ok: false, error: 'video_type' });
    expect(checkCoachVideo('video/mp4', COACH_VIDEO_MAX_BYTES + 1)).toEqual({ ok: false, error: 'video_size' });
    expect(coachVideoObject('coach-1', 'mp4')).toMatch(/^coach-videos\/coach-1\/[a-f0-9]{32}\.mp4$/);
    expect(() => coachVideoObject('../x', 'mp4')).toThrow();
  });
  it('the signed PUT binds the size and lands in own storage; no bucket → UploadsComingSoon', async () => {
    const sign = { sign: async () => 'cd'.repeat(32), now: () => new Date('2026-10-27T18:00:00Z') };
    const put = await signOwnPut({ bucket: 'fel-public', objectName: 'coach-videos/coach-1/abcdef0123.mp4', contentType: 'video/mp4', bytes: 1234 }, sign);
    expect(put.url).toMatch(/^https:\/\/storage\.googleapis\.com\/fel-public\/coach-videos\/coach-1\/abcdef0123\.mp4\?.*X-Goog-Signature=cdcd/);
    expect(put.headers['x-goog-content-length-range']).toBe('1234,1234');
    expect(put.objectUrl).toBe('https://storage.googleapis.com/fel-public/coach-videos/coach-1/abcdef0123.mp4');
    await expect(signOwnPut({ bucket: null, objectName: 'x', contentType: 'video/mp4', bytes: 1 }, sign)).rejects.toBeInstanceOf(UploadsComingSoon);
  });
});
