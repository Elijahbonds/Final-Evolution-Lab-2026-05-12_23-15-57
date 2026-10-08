// CREATOR SOUNDTRACK phase 0: the creator-media GCS signer. No network: the signer, the token and fetch are stood in.
import { describe, expect, it } from 'vitest';
import { canonicalStringToSign } from '@/lib/coach-store/storage';
import {
  MEDIA_LIMITS, UploadsComingSoon, assertMediaObject, buildSignedRequest, cardMediaPreview, checkUpload, creatorMediaBuckets,
  mediaUrlsOf, pendingObjectName, pendingObjectOf, promoteCardMedia, promoteToPublic, publicObjectName, signCreatorPut,
} from './storage';

const env = { CREATOR_MEDIA_BUCKET: 'fel-creator-pending', CREATOR_MEDIA_PUBLIC_BUCKET: 'fel-creator-public' } as unknown as NodeJS.ProcessEnv;
const now = () => new Date('2026-10-06T12:00:00Z');
const token = async () => ({ accessToken: 'tok', email: 'svc@proj.iam.gserviceaccount.com' });

describe('buckets fail closed', () => {
  it('both names are required, valid and different', () => {
    expect(creatorMediaBuckets(env)).toEqual({ pending: 'fel-creator-pending', public: 'fel-creator-public' });
    for (const bad of [{}, { CREATOR_MEDIA_BUCKET: 'a-b' }, { ...env, CREATOR_MEDIA_PUBLIC_BUCKET: 'Bad Name' }, { CREATOR_MEDIA_BUCKET: 'same1', CREATOR_MEDIA_PUBLIC_BUCKET: 'same1' }]) {
      expect(() => creatorMediaBuckets(bad as never)).toThrow(UploadsComingSoon);
    }
  });
});

describe('checkUpload: the size and length binding', () => {
  it('audio up to 8 MB and 4 minutes; images up to 2 MB; size always required', () => {
    expect(checkUpload({ contentType: 'audio/mpeg', bytes: MEDIA_LIMITS.audioBytes, durationSec: 240 })).toEqual({ ok: true, ext: 'mp3', kind: 'audio' });
    expect(checkUpload({ contentType: 'audio/mpeg', bytes: MEDIA_LIMITS.audioBytes + 1, durationSec: 60 }).ok).toBe(false);
    expect(checkUpload({ contentType: 'audio/mpeg', bytes: 100, durationSec: 240.5 }).ok).toBe(false);
    expect(checkUpload({ contentType: 'audio/mpeg', bytes: 100 }).ok).toBe(false);
    expect(checkUpload({ contentType: 'audio/x-m4a', bytes: 100, durationSec: 10 })).toMatchObject({ ok: true, ext: 'm4a' });
    expect(checkUpload({ contentType: 'image/png', bytes: MEDIA_LIMITS.imageBytes })).toMatchObject({ ok: true });
    expect(checkUpload({ contentType: 'image/png', bytes: MEDIA_LIMITS.imageBytes + 1 }).ok).toBe(false);
    expect(checkUpload({ contentType: 'image/png', bytes: 1.5 }).ok).toBe(false);
    expect(checkUpload({ contentType: 'image/png', bytes: 0 }).ok).toBe(false);
    expect(checkUpload({ contentType: 'text/html', bytes: 10 }).ok).toBe(false);
  });
});

describe('object names', () => {
  it('pending/<user>/<file>.<ext>, nothing that climbs out', () => {
    expect(pendingObjectName('user_1', 'abc123', 'mp3')).toBe('pending/user_1/abc123.mp3');
    expect(publicObjectName('pending/user_1/abc123.mp3')).toBe('tracks/user_1/abc123.mp3');
    for (const [u, f, e] of [['..', 'a', 'mp3'], ['u/x', 'a', 'mp3'], ['u', 'a.b', 'mp3'], ['u', 'a', 'MP3'], ['u', 'a', 'mp3/x']]) {
      expect(() => pendingObjectName(u, f, e)).toThrow('bad_object');
    }
    expect(() => assertMediaObject('pending/u/../x.mp3', 'pending/')).toThrow();
    expect(() => assertMediaObject('tracks/u/a.mp3', 'pending/')).toThrow();
  });
  it('only this module\'s pending URLs map back to an object', () => {
    expect(pendingObjectOf('https://storage.googleapis.com/fel-creator-pending/pending/u/a.mp3', env)).toBe('pending/u/a.mp3');
    expect(pendingObjectOf('https://storage.googleapis.com/other/pending/u/a.mp3', env)).toBe(null);
    expect(pendingObjectOf('https://x.s3.amazonaws.com/a.wav', env)).toBe(null);
    expect(pendingObjectOf('https://storage.googleapis.com/fel-creator-pending/pending/u/a.mp3', {} as never)).toBe(null);
  });
});

describe('signing', () => {
  it('builds the same canonical request as coach-store\'s signer (the known-good control)', async () => {
    const input = { method: 'PUT' as const, bucket: 'fel-creator-pending', objectName: 'pending/u/a.mp3', expiresSec: 900, now: now(), email: 'svc@x', contentType: 'audio/mpeg', bytes: 1234 };
    expect(buildSignedRequest(input).stringToSign).toBe(await canonicalStringToSign(input));
    const get = { method: 'GET' as const, bucket: 'b-1', objectName: 'pending/u/a.mp3', expiresSec: 60, now: now(), email: 'svc@x' };
    expect(buildSignedRequest(get).stringToSign).toBe(await canonicalStringToSign(get));
  });
  it('a PUT binds the exact size and type into the signed headers, and tells the browser to send them', async () => {
    const signed: string[] = [];
    const out = await signCreatorPut({ objectName: 'pending/u/a.mp3', contentType: 'audio/mpeg', bytes: 4321 }, {
      env, now, token, sign: async (s) => { signed.push(s); return 'deadbeef'; },
    });
    expect(out.url).toContain('X-Goog-SignedHeaders=content-type%3Bhost%3Bx-goog-content-length-range');
    expect(out.url).toContain('X-Goog-Signature=deadbeef');
    expect(out.url.startsWith('https://storage.googleapis.com/fel-creator-pending/pending/u/a.mp3?')).toBe(true);
    expect(out.headers).toEqual({ 'Content-Type': 'audio/mpeg', 'x-goog-content-length-range': '4321,4321' });
    expect(out.pendingUrl).toBe('https://storage.googleapis.com/fel-creator-pending/pending/u/a.mp3');
    expect(signed).toHaveLength(1);
    // a different size is a different signature input: the size is really in what was signed
    const other: string[] = [];
    await signCreatorPut({ objectName: 'pending/u/a.mp3', contentType: 'audio/mpeg', bytes: 4322 }, { env, now, token, sign: async (s) => { other.push(s); return 'x'; } });
    expect(other[0]).not.toBe(signed[0]);
  });
  it('refuses an oversize or wrong-prefix PUT, and throws UploadsComingSoon with no bucket', async () => {
    const deps = { env, now, token, sign: async () => 'x' };
    await expect(signCreatorPut({ objectName: 'pending/u/a.mp3', contentType: 'audio/mpeg', bytes: MEDIA_LIMITS.audioBytes + 1 }, deps)).rejects.toThrow();
    await expect(signCreatorPut({ objectName: 'tracks/u/a.mp3', contentType: 'audio/mpeg', bytes: 10 }, deps)).rejects.toThrow('bad_object');
    await expect(signCreatorPut({ objectName: 'pending/u/a.mp3', contentType: 'audio/mpeg', bytes: 10 }, { ...deps, env: {} as never })).rejects.toBeInstanceOf(UploadsComingSoon);
  });
});

describe('promotion on approval', () => {
  it('copies pending → public with an immutable cache header, following a rewrite token', async () => {
    const calls: { url: string; body: any }[] = [];
    let n = 0;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      n++;
      return new Response(JSON.stringify(n === 1 ? { done: false, rewriteToken: 'tk' } : { done: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const url = await promoteToPublic('pending/u/a.mp3', { env, token, fetchImpl });
    expect(url).toBe('https://storage.googleapis.com/fel-creator-public/tracks/u/a.mp3');
    expect(calls[0].url).toBe('https://storage.googleapis.com/storage/v1/b/fel-creator-pending/o/pending%2Fu%2Fa.mp3/rewriteTo/b/fel-creator-public/o/tracks%2Fu%2Fa.mp3');
    expect(calls[1].url.endsWith('?rewriteToken=tk')).toBe(true);
    expect(calls[0].body).toEqual({ cacheControl: 'public, max-age=31536000, immutable', contentType: 'audio/mpeg' });
  });
  it('a failed copy throws (so the route keeps the card pending)', async () => {
    const fetchImpl = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    await expect(promoteToPublic('pending/u/a.mp3', { env, token, fetchImpl })).rejects.toBeInstanceOf(UploadsComingSoon);
  });
  it('promoteCardMedia maps only this bucket\'s pending URLs; preview never throws', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ done: true }), { status: 200 })) as unknown as typeof fetch;
    const art = { kind: 'music', mixUrl: 'https://storage.googleapis.com/fel-creator-pending/pending/u/m.mp3', stemUrls: ['https://s3/x.wav'], coverArtUrl: '' };
    expect(mediaUrlsOf(art)).toEqual(['https://storage.googleapis.com/fel-creator-pending/pending/u/m.mp3', 'https://s3/x.wav']);
    expect(await promoteCardMedia(art, { env, token, fetchImpl })).toEqual({
      'https://storage.googleapis.com/fel-creator-pending/pending/u/m.mp3': 'https://storage.googleapis.com/fel-creator-public/tracks/u/m.mp3',
    });
    expect(await promoteCardMedia({ kind: 'scene' }, { env: {} as never })).toEqual({});
    const prev = await cardMediaPreview(art, { env, now, token, sign: async () => 'sig' });
    expect(Object.keys(prev)).toEqual(['https://storage.googleapis.com/fel-creator-pending/pending/u/m.mp3']);
    expect(await cardMediaPreview(art, { env: {} as never })).toEqual({});
  });
});
