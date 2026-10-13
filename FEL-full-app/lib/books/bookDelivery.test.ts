import { describe, expect, it } from 'vitest';
import { issueBookFile, type SignRequest } from './bookDelivery';

function signer() {
  const calls: SignRequest[] = [];
  return {
    calls,
    sign: async (request: SignRequest) => {
      calls.push(request);
      return `https://signed.example/${request.storagePath}?ttl=${request.ttlSeconds}`;
    },
  };
}

describe('signed-url gating', () => {
  it('does not sign when the buyer does not own the format', async () => {
    const s = signer();
    const result = await issueBookFile(
      { bookSlug: 'blueprint', fileId: 'epub', entitlements: [] },
      { sign: s.sign, ttlSeconds: 600 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(s.calls).toEqual([]);
  });

  it('an ebook purchase signs the epub and pdf, and refuses the audio', async () => {
    const owned = [{ bookSlug: 'blueprint', format: 'ebook', status: 'ACTIVE' }];
    const epub = signer();
    const ok = await issueBookFile({ bookSlug: 'blueprint', fileId: 'epub', entitlements: owned }, { sign: epub.sign, ttlSeconds: 600 });
    expect(ok.ok).toBe(true);
    expect(epub.calls).toHaveLength(1);
    expect(epub.calls[0].storagePath).toBe('books/blueprint/ebook/book.epub');
    expect(epub.calls[0].ttlSeconds).toBe(600);
    expect(epub.calls[0].disposition).toBe('attachment');
    expect(epub.calls[0].contentType).toBe('application/epub+zip');

    const audio = signer();
    const denied = await issueBookFile(
      { bookSlug: 'blueprint', fileId: 'audio-00', entitlements: owned },
      { sign: audio.sign, ttlSeconds: 600 },
    );
    expect(denied.ok).toBe(false);
    expect(audio.calls).toEqual([]);
  });

  it('a bundle signs the chapter, and a revoked audiobook does not', async () => {
    const s = signer();
    const ok = await issueBookFile(
      {
        bookSlug: 'blueprint',
        fileId: 'audio-02',
        entitlements: [{ bookSlug: 'blueprint', format: 'bundle', status: 'ACTIVE' }],
      },
      { sign: s.sign, ttlSeconds: 600 },
    );
    expect(ok.ok).toBe(true);
    expect(s.calls[0].storagePath).toBe('books/blueprint/audio/02-chapter-2.mp3');
    expect(s.calls[0].disposition).toBe('inline');
    expect(s.calls[0].contentType).toBe('audio/mpeg');

    const revoked = signer();
    const denied = await issueBookFile(
      {
        bookSlug: 'blueprint',
        fileId: 'audio-02',
        entitlements: [{ bookSlug: 'blueprint', format: 'audiobook', status: 'REVOKED' }],
      },
      { sign: revoked.sign },
    );
    expect(denied.ok).toBe(false);
    expect(revoked.calls).toEqual([]);
  });

  it('signs the free sample with no entitlement, and never a path the client invented', async () => {
    const sample = signer();
    const ok = await issueBookFile(
      { bookSlug: 'blueprint', fileId: 'audio-01', entitlements: [] },
      { sign: sample.sign, ttlSeconds: 600 },
    );
    expect(ok.ok).toBe(true);
    expect(sample.calls[0].storagePath).toBe('books/blueprint/audio/01-chapter-1.mp3');

    const forged = signer();
    const missing = await issueBookFile(
      { bookSlug: 'blueprint', fileId: '../secrets/key', entitlements: [{ bookSlug: 'blueprint', format: 'bundle', status: 'ACTIVE' }] },
      { sign: forged.sign },
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(404);
    expect(forged.calls).toEqual([]);
  });
});
