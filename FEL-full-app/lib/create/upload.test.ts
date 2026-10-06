// CREATE HUB: one upload on lane/soundtrack's signed, size-bound contract, and every refusal in the player's words.
import { describe, expect, it } from 'vitest';
import { UploadError, uploadMedia } from './upload';

type Call = { url: string; init?: RequestInit };
function fakeFetch(sign: { status: number; body: unknown }, put = { status: 200 }) {
  const calls: Call[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = url.startsWith('/api/') ? sign : { ...put, body: {} };
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
  return { f, calls };
}
const blob = new Blob([new Uint8Array(1234)], { type: 'audio/wav' });

describe('uploadMedia', () => {
  it('signs with the size and length, PUTs with the signed headers, returns the pending address', async () => {
    const { f, calls } = fakeFetch({ status: 200, body: { uploadUrl: 'https://storage.googleapis.com/b/pending/x?sig', headers: { 'content-type': 'audio/wav', 'x-goog-content-length-range': '1234,1234' }, publicUrl: 'https://storage.googleapis.com/b/pending/x' } });
    const url = await uploadMedia({ body: blob, fileName: 'my song!.wav', contentType: 'audio/wav', durationSec: 31.234 }, f);
    expect(url).toBe('https://storage.googleapis.com/b/pending/x');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ fileName: 'my_song_.wav', contentType: 'audio/wav', bytes: 1234, durationSec: 31.23 });
    expect(calls[1]).toMatchObject({ url: 'https://storage.googleapis.com/b/pending/x?sig', init: { method: 'PUT', headers: { 'x-goog-content-length-range': '1234,1234' } } });
    expect(calls[1].init!.body).toBe(blob);
  });
  it.each([
    [403, { error: 'device_only', message: 'Uploads are for creators 18 and over. Your work stays on this device.' }, 'device_only', /18 and over/],
    [503, { error: 'uploads_coming_soon' }, 'coming_soon', /coming soon/],
    [429, { error: 'too many' }, 'rate_limited', /Too many/],
    [422, { error: 'Audio files can be up to 8 MB.' }, 'refused', /8 MB/],
  ] as const)('%s → %s', async (status, body, code, text) => {
    const { f, calls } = fakeFetch({ status, body });
    const p = uploadMedia({ body: blob, fileName: 'a.wav', contentType: 'audio/wav', durationSec: 3 }, f);
    await expect(p).rejects.toBeInstanceOf(UploadError);
    await expect(p).rejects.toMatchObject({ code, message: expect.stringMatching(text) });
    expect(calls).toHaveLength(1);   // never PUTs after a refusal
  });
  it('a failed PUT, a network error, and a sign with no address are errors too', async () => {
    const ok = { status: 200, body: { uploadUrl: 'https://u', publicUrl: 'https://p' } };
    await expect(uploadMedia({ body: blob, fileName: 'a', contentType: 'image/png' }, fakeFetch(ok, { status: 403 }).f)).rejects.toMatchObject({ code: 'put_failed' });
    await expect(uploadMedia({ body: blob, fileName: 'a', contentType: 'image/png' }, async () => { throw new TypeError('offline'); })).rejects.toMatchObject({ code: 'network' });
    await expect(uploadMedia({ body: blob, fileName: 'a', contentType: 'image/png' }, fakeFetch({ status: 200, body: {} }).f)).rejects.toMatchObject({ code: 'refused' });
  });
  it('an image sends no length', async () => {
    const { f, calls } = fakeFetch({ status: 200, body: { uploadUrl: 'https://u', publicUrl: 'https://p' } });
    await uploadMedia({ body: blob, fileName: 'c.png', contentType: 'image/png' }, f);
    expect('durationSec' in JSON.parse(String(calls[0].init!.body))).toBe(false);
  });
});
