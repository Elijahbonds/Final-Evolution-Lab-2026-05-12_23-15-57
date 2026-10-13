import { describe, expect, it } from 'vitest';
import { BOOKS } from './bookCatalog';
import {
  FORMAT_NOT_OFFERED_ERROR,
  STREAM_URL_TTL_SECONDS,
  issueBookDownload,
  issueBookStream,
  type SignRequest,
} from './bookDelivery';
import { CLOSED_POLICY, EBOOK_ENABLED_POLICY } from '@/tests/helpers/bookTermsPolicies';

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

const AUDIO = { bookSlug: 'blueprint', format: 'audiobook', status: 'ACTIVE' };
const EBOOK = { bookSlug: 'blueprint', format: 'ebook', status: 'ACTIVE' };
const BUNDLE = { bookSlug: 'blueprint', format: 'bundle', status: 'ACTIVE' };

// test changed (2026-10-13): this file used issueBookFile for both audio and ebook files. It is now two doors,
// issueBookStream (mp3, always inline) and issueBookDownload (EPUB/PDF, closed under the live terms). The old
// assertions are kept on the matching door; the ebook-signing ones run under the EBOOK_ENABLED fixture policy.
describe('stream gate (audiobook chapters, inline only)', () => {
  it('does not sign when the buyer does not own the audiobook', async () => {
    const s = signer();
    const result = await issueBookStream({ bookSlug: 'blueprint', fileId: 'audio-03', entitlements: [] }, { sign: s.sign });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(s.calls).toEqual([]);
  });

  it('an ebook purchase does not cover the audio', async () => {
    const s = signer();
    const result = await issueBookStream({ bookSlug: 'blueprint', fileId: 'audio-03', entitlements: [EBOOK] }, { sign: s.sign, policy: EBOOK_ENABLED_POLICY });
    expect(result.ok).toBe(false);
    expect(s.calls).toEqual([]);
  });

  it('an owner gets one inline, short-lived, filename-free-disposition mp3 URL', async () => {
    const s = signer();
    const result = await issueBookStream({ bookSlug: 'blueprint', fileId: 'audio-03', entitlements: [AUDIO] }, { sign: s.sign });
    expect(result.ok).toBe(true);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].storagePath).toBe('books/blueprint/audio/03-chapter-3.mp3');
    expect(s.calls[0].disposition).toBe('inline');
    expect(s.calls[0].contentType).toBe('audio/mpeg');
    expect(s.calls[0].ttlSeconds).toBeLessThanOrEqual(STREAM_URL_TTL_SECONDS);
  });

  it('a long configured lifetime is still capped at the stream maximum', async () => {
    const s = signer();
    await issueBookStream({ bookSlug: 'blueprint', fileId: 'audio-03', entitlements: [AUDIO] }, { sign: s.sign, ttlSeconds: 3600 });
    expect(s.calls[0].ttlSeconds).toBe(STREAM_URL_TTL_SECONDS);
  });

  it('a bundle signs the chapter, and a revoked audiobook does not', async () => {
    const s = signer();
    const ok = await issueBookStream({ bookSlug: 'blueprint', fileId: 'audio-02', entitlements: [BUNDLE] }, { sign: s.sign });
    expect(ok.ok).toBe(true);
    expect(s.calls[0].storagePath).toBe('books/blueprint/audio/02-chapter-2.mp3');
    expect(s.calls[0].disposition).toBe('inline');

    const revoked = signer();
    const denied = await issueBookStream(
      { bookSlug: 'blueprint', fileId: 'audio-02', entitlements: [{ ...AUDIO, status: 'REVOKED' }] },
      { sign: revoked.sign },
    );
    expect(denied.ok).toBe(false);
    expect(revoked.calls).toEqual([]);
  });

  it('signs the free sample with no entitlement, and never a path the client invented', async () => {
    const sample = signer();
    const ok = await issueBookStream({ bookSlug: 'blueprint', fileId: 'audio-01', entitlements: [] }, { sign: sample.sign });
    expect(ok.ok).toBe(true);
    expect(sample.calls[0].storagePath).toBe('books/blueprint/audio/01-chapter-1.mp3');
    expect(sample.calls[0].disposition).toBe('inline');

    const forged = signer();
    const missing = await issueBookStream({ bookSlug: 'blueprint', fileId: '../secrets/key', entitlements: [BUNDLE] }, { sign: forged.sign });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(404);
    expect(forged.calls).toEqual([]);
  });

  it('the stream door never signs an ebook file, whatever the buyer owns or the terms say', async () => {
    for (const policy of [undefined, EBOOK_ENABLED_POLICY]) {
      for (const fileId of ['epub', 'pdf']) {
        const s = signer();
        const result = await issueBookStream({ bookSlug: 'blueprint', fileId, entitlements: [EBOOK, BUNDLE, AUDIO] }, { sign: s.sign, policy });
        expect(result.ok).toBe(false);
        expect(s.calls).toEqual([]);
      }
    }
  });

  it('under a terms version that is not listed nothing streams, not even the sample', async () => {
    for (const fileId of ['audio-01', 'audio-03']) {
      const s = signer();
      const result = await issueBookStream({ bookSlug: 'blueprint', fileId, entitlements: [AUDIO] }, { sign: s.sign, policy: CLOSED_POLICY });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
      expect(s.calls).toEqual([]);
    }
  });

  it('whatever it is asked for, the stream door only ever signs `inline`', async () => {
    const s = signer();
    for (const book of BOOKS) {
      for (const file of book.files) {
        await issueBookStream({ bookSlug: book.slug, fileId: file.id, entitlements: [{ ...AUDIO, bookSlug: book.slug }, { ...BUNDLE, bookSlug: book.slug }] }, { sign: s.sign });
      }
    }
    expect(s.calls.length).toBeGreaterThan(0);
    expect(s.calls.every((c) => c.disposition === 'inline' && c.storagePath.endsWith('.mp3'))).toBe(true);
  });
});

describe('download gate (ebook files, closed under the live terms)', () => {
  it('under the live terms (audiobooks, stream only) it signs nothing: owner, bundle owner, nobody, any file', async () => {
    const files = BOOKS.flatMap((b) => b.files.map((f) => ({ slug: b.slug, id: f.id })));
    for (const { slug, id } of files) {
      for (const entitlements of [[{ ...EBOOK, bookSlug: slug }], [{ ...BUNDLE, bookSlug: slug }], [{ ...AUDIO, bookSlug: slug }], []]) {
        const s = signer();
        const result = await issueBookDownload({ bookSlug: slug, fileId: id, entitlements }, { sign: s.sign });
        expect(result.ok).toBe(false);
        expect(s.calls).toEqual([]);
      }
    }
  });

  it('the refusal for an ebook file is the terms refusal (403), not a missing-file 404', async () => {
    const s = signer();
    const result = await issueBookDownload({ bookSlug: 'blueprint', fileId: 'epub', entitlements: [EBOOK] }, { sign: s.sign });
    expect(result).toEqual({ ok: false, status: 403, error: FORMAT_NOT_OFFERED_ERROR });
  });

  it('when a future terms version covers ebooks and downloads, an owner gets an attachment and a non-owner does not', async () => {
    const epub = signer();
    const ok = await issueBookDownload({ bookSlug: 'blueprint', fileId: 'epub', entitlements: [EBOOK] }, { sign: epub.sign, ttlSeconds: 600, policy: EBOOK_ENABLED_POLICY });
    expect(ok.ok).toBe(true);
    expect(epub.calls[0].storagePath).toBe('books/blueprint/ebook/book.epub');
    expect(epub.calls[0].ttlSeconds).toBe(600);
    expect(epub.calls[0].disposition).toBe('attachment');
    expect(epub.calls[0].contentType).toBe('application/epub+zip');

    const audioOnly = signer();
    const denied = await issueBookDownload({ bookSlug: 'blueprint', fileId: 'pdf', entitlements: [AUDIO] }, { sign: audioOnly.sign, policy: EBOOK_ENABLED_POLICY });
    expect(denied.ok).toBe(false);
    expect(audioOnly.calls).toEqual([]);
  });

  it('an audiobook chapter is never a download, even under the ebook-enabled policy', async () => {
    const s = signer();
    const result = await issueBookDownload({ bookSlug: 'blueprint', fileId: 'audio-03', entitlements: [AUDIO, BUNDLE] }, { sign: s.sign, policy: EBOOK_ENABLED_POLICY });
    expect(result.ok).toBe(false);
    expect(s.calls).toEqual([]);
  });
});
