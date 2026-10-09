import { afterEach, describe, expect, it } from 'vitest';
import { assertObjectName, deleteOriginalObject, originalObjectName, replyObjectName, reviewsBucket, signPutUrl, UploadsComingSoon } from './storage';

const env = { ...process.env };

afterEach(() => {
  process.env = { ...env };
});

describe('signed uploads', () => {
  it('rejects a path that climbs out, and a size over the cap before any network', async () => {
    expect(() => assertObjectName('coach-reviews/originals/../x.mp4')).toThrow(/bad_object/);
    expect(() => assertObjectName('coach-reviews/originals/%2e%2e/x.mp4')).toThrow(/bad_object/);
    process.env.COACH_REVIEWS_BUCKET = 'unit-test-bucket';
    let called = false;
    await expect(signPutUrl(
      { objectName: originalObjectName('book1', 'file1', 'mp4'), contentType: 'video/mp4', bytes: 209715201 },
      { sign: async () => { called = true; return 'ab'; } },
    )).rejects.toThrow(/60/);
    expect(called).toBe(false);
  });

  it('fails closed when the bucket is unset and signs a put with the length header', async () => {
    delete process.env.COACH_REVIEWS_BUCKET;
    expect(() => reviewsBucket()).toThrow(UploadsComingSoon);
    process.env.COACH_REVIEWS_BUCKET = 'unit-test-bucket';
    let signed = '';
    const out = await signPutUrl(
      { objectName: originalObjectName('book1', 'file1', 'mp4'), contentType: 'video/mp4', bytes: 1000 },
      { sign: async (payload) => { signed = payload; return 'abcd'; }, now: () => new Date('2026-08-01T00:00:00Z') },
    );
    expect(out.headers['x-goog-content-length-range']).toBe('1000,1000');
    expect(out.url).toContain('X-Goog-Signature=abcd');
    expect(out.url).toContain('x-goog-content-length-range');
    expect(signed).toContain('GOOG4-RSA-SHA256');
    expect(out.url).not.toContain('fel-coach-reviews');
  });

  it('deletes an original, treats 404 as gone, and refuses a reply', async () => {
    process.env.COACH_REVIEWS_BUCKET = 'unit-test-bucket';
    const deps = {
      token: async () => ({ accessToken: 'tok', email: 'sa@test.iam.gserviceaccount.com' }),
      fetchImpl: async () => new Response(null, { status: 204 }),
    };
    await expect(deleteOriginalObject(replyObjectName('book1', 'file1', 'webm'), deps)).rejects.toThrow(/bad_object/);
    const name = originalObjectName('book1', 'file1', 'mp4');
    await expect(deleteOriginalObject(name, deps)).resolves.toBe('deleted');
    await expect(deleteOriginalObject(name, {
      ...deps,
      fetchImpl: async () => new Response('missing', { status: 404 }),
    })).resolves.toBe('missing');
    await expect(deleteOriginalObject(name, {
      ...deps,
      fetchImpl: async () => new Response('no', { status: 500 }),
    })).rejects.toBeInstanceOf(UploadsComingSoon);
  });
});
