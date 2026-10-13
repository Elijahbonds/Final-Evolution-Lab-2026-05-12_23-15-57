// Owner 2026-10-13 (store-terms-2026-10-12: audiobooks, stream only, no download):
// POST /api/books/stream mints ONE short-lived inline URL per play, for an entitled, signed-in, verified-adult
// buyer. Owner 2026-10-13: listening is NOT behind BOOK_STORE_ENABLED / VIRTUAL_PURCHASES_ENABLED, so a paid buyer keeps
// streaming with the shop off (selling stays closed: bookCheckoutRoute.test.ts). No route ever returns a download or attachment URL.
// next-auth, prisma and the entitlement store are mocked; the gate, the delivery rule, the real signer and the routes are real.
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

const h = vi.hoisted(() => ({
  session: { user: { id: 'buyer-1', email: 'buyer@fel.test' } } as { user: { id?: string; email?: string } } | null,
  isAdult: true,
  adultCalls: [] as string[],
  rows: [{ bookSlug: 'blueprint', format: 'audiobook', status: 'ACTIVE' }] as { bookSlug: string; format: string; status: string }[],
  tablesReady: true,
  listCalls: 0,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/rate-limit', () => ({
  clientKeyFromHeaders: () => 'test-ip',
  rateLimit: () => ({ ok: true, retryAfterSec: 0 }),
}));
vi.mock('@/lib/coach-store/adult', () => ({
  isVerifiedAdult: async (_db: unknown, userId: string) => {
    h.adultCalls.push(userId);
    return h.isAdult;
  },
}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/books/bookStore', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/books/bookStore')>();
  return {
    ...actual,
    prismaBookStore: () => ({
      claimByEmail: async () => 0,
      listActive: async () => {
        h.listCalls += 1;
        if (!h.tablesReady) throw new actual.BookTablesNotReady();
        return h.rows;
      },
    }),
  };
});

import { POST as STREAM } from '@/app/api/books/stream/route';
import { POST as DOWNLOAD } from '@/app/api/books/download/route';
import { BOOKS } from '@/lib/books/bookCatalog';

const ENV_KEYS = [
  'BOOK_STORE_ENABLED', 'VIRTUAL_PURCHASES_ENABLED', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
  'FIREBASE_SERVICE_ACCOUNT_JSON', 'BOOK_SIGNED_URL_TTL_SECONDS',
] as const;
const SAVED: Record<string, string | undefined> = {};

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
async function stream(body: unknown) {
  const res = await STREAM(post('/api/books/stream', body));
  return { status: res.status, json: await res.json(), headers: res.headers };
}
async function download(body: unknown) {
  const res = await DOWNLOAD(post('/api/books/download', body));
  return { status: res.status, json: await res.json() };
}

const CHAPTER = { bookSlug: 'blueprint', fileId: 'audio-03' };

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
  process.env.BOOK_STORE_ENABLED = '1';
  process.env.VIRTUAL_PURCHASES_ENABLED = '1';
  process.env.FIREBASE_CLIENT_EMAIL = 'signer@test.iam.gserviceaccount.com';
  process.env.FIREBASE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.BOOK_SIGNED_URL_TTL_SECONDS;
  h.session = { user: { id: 'buyer-1', email: 'buyer@fel.test' } };
  h.isAdult = true;
  h.adultCalls.length = 0;
  h.rows = [{ bookSlug: 'blueprint', format: 'audiobook', status: 'ACTIVE' }];
  h.tablesReady = true;
  h.listCalls = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  vi.restoreAllMocks();
});

describe('POST /api/books/stream: the happy path', () => {
  it('an entitled, signed-in, verified adult gets one short-lived inline URL, uncached, with no filename', async () => {
    const r = await stream(CHAPTER);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.json.expiresIn).toBeLessThanOrEqual(300);
    const url = new URL(r.json.url);
    expect(url.hostname).toBe('storage.googleapis.com');
    expect(url.pathname).toContain('/books/blueprint/audio/03-chapter-3.mp3');
    expect(url.searchParams.get('response-content-disposition')).toBe('inline');
    expect(url.searchParams.get('response-content-type')).toBe('audio/mpeg');
    expect(Number(url.searchParams.get('X-Goog-Expires'))).toBeLessThanOrEqual(300);
    expect(JSON.stringify(r.json)).not.toMatch(/attachment|filename/i);
  });

  it('a configured 1-hour lifetime is still capped for a stream', async () => {
    process.env.BOOK_SIGNED_URL_TTL_SECONDS = '3600';
    const r = await stream(CHAPTER);
    expect(Number(new URL(r.json.url).searchParams.get('X-Goog-Expires'))).toBeLessThanOrEqual(300);
  });
});

describe('POST /api/books/stream: refusals (fail closed)', () => {
  it.each([undefined, '', '0', 'false', 'nope'])('BOOK_STORE_ENABLED=%s: the shop is off, an entitled adult still streams', async (v) => {
    if (v === undefined) delete process.env.BOOK_STORE_ENABLED;
    else process.env.BOOK_STORE_ENABLED = v;
    const r = await stream(CHAPTER);
    expect(r.status).toBe(200);
    expect(new URL(r.json.url).searchParams.get('response-content-disposition')).toBe('inline');
    expect(h.adultCalls).toEqual(['buyer-1']);   // the adult check still ran
    expect(h.listCalls).toBe(1);                  // and so did the entitlement check
  });

  it('VIRTUAL_PURCHASES_ENABLED off (the B10 fence): an entitled adult still streams', async () => {
    delete process.env.VIRTUAL_PURCHASES_ENABLED;
    const r = await stream(CHAPTER);
    expect(r.status).toBe(200);
    expect(r.json.url).toBeDefined();
  });

  describe('with BOTH switches off, every other check still refuses', () => {
    beforeEach(() => {
      delete process.env.BOOK_STORE_ENABLED;
      delete process.env.VIRTUAL_PURCHASES_ENABLED;
    });
    it('signed out -> 401', async () => {
      h.session = null;
      const r = await stream(CHAPTER);
      expect(r.status).toBe(401);
      expect(r.json.url).toBeUndefined();
      expect(h.listCalls).toBe(0);
    });
    it('under 18 / unknown age -> 403 adults_only, entitlements never read', async () => {
      h.isAdult = false;
      const r = await stream(CHAPTER);
      expect(r.status).toBe(403);
      expect(r.json).toEqual({ error: 'adults_only' });
      expect(h.listCalls).toBe(0);
    });
    it('not entitled -> 403', async () => {
      h.rows = [];
      const r = await stream(CHAPTER);
      expect(r.status).toBe(403);
      expect(r.json.url).toBeUndefined();
    });
    it('book tables missing -> 503 "Library is unavailable right now." (fail closed)', async () => {
      h.tablesReady = false;
      const r = await stream(CHAPTER);
      expect(r.status).toBe(503);
      expect(r.json).toEqual({ error: 'Library is unavailable right now.' });
    });
  });

  it('signed out -> 401, no age lookup, no URL', async () => {
    h.session = null;
    const r = await stream(CHAPTER);
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ error: 'unauthorized' });
    expect(h.adultCalls).toEqual([]);
    expect(h.listCalls).toBe(0);
  });

  it('an identity with an email but no user id is still 401 (no guest listening)', async () => {
    h.session = { user: { email: 'guest@fel.test' } };
    const r = await stream(CHAPTER);
    expect(r.status).toBe(401);
  });

  it('under 18 / unknown age -> 403 adults_only, entitlements never read, no URL', async () => {
    h.isAdult = false;
    const r = await stream(CHAPTER);
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'adults_only' });
    expect(h.adultCalls).toEqual(['buyer-1']);
    expect(h.listCalls).toBe(0);
  });

  it('not entitled -> 403, no URL', async () => {
    h.rows = [];
    const r = await stream(CHAPTER);
    expect(r.status).toBe(403);
    expect(r.json.url).toBeUndefined();
  });

  it('owns a different book, or only a revoked audiobook -> 403', async () => {
    h.rows = [{ bookSlug: 'unfair-advantages', format: 'audiobook', status: 'ACTIVE' }];
    expect((await stream(CHAPTER)).status).toBe(403);
    h.rows = [{ bookSlug: 'blueprint', format: 'audiobook', status: 'REVOKED' }];
    expect((await stream(CHAPTER)).status).toBe(403);
  });

  it('an ebook-only owner cannot stream the audio', async () => {
    h.rows = [{ bookSlug: 'blueprint', format: 'ebook', status: 'ACTIVE' }];
    expect((await stream(CHAPTER)).status).toBe(403);
  });

  it('book tables not set up -> 503 "Library is unavailable right now."', async () => {
    h.tablesReady = false;
    const r = await stream(CHAPTER);
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ error: 'Library is unavailable right now.' });
  });

  it('storage not configured -> 503, never a made-up URL', async () => {
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    const r = await stream(CHAPTER);
    expect(r.status).toBe(503);
    expect(r.json.url).toBeUndefined();
  });

  it.each(['epub', 'pdf'])('an ebook file (%s) is never streamed, even for a bundle owner', async (fileId) => {
    h.rows = [{ bookSlug: 'blueprint', format: 'bundle', status: 'ACTIVE' }];
    const r = await stream({ bookSlug: 'blueprint', fileId });
    expect(r.status).toBe(404);
    expect(r.json.url).toBeUndefined();
  });

  it('unknown book or file, and a forged path -> 404', async () => {
    expect((await stream({ bookSlug: 'nope', fileId: 'audio-03' })).status).toBe(404);
    expect((await stream({ bookSlug: 'blueprint', fileId: '../../etc/passwd' })).status).toBe(404);
    expect((await stream({})).status).toBe(404);
  });
});

describe('POST /api/books/stream: the free sample is the one public chapter', () => {
  it('streams with no session, no age check and the shop switched off (it is not a sale)', async () => {
    h.session = null;
    delete process.env.BOOK_STORE_ENABLED;
    const r = await stream({ bookSlug: 'blueprint', fileId: 'audio-01' });
    expect(r.status).toBe(200);
    expect(new URL(r.json.url).searchParams.get('response-content-disposition')).toBe('inline');
    expect(h.adultCalls).toEqual([]);
  });

  it('only the flagged sample: the next chapter still needs everything', async () => {
    h.session = null;
    const r = await stream({ bookSlug: 'blueprint', fileId: 'audio-02' });
    expect(r.status).toBe(401);
  });
});

describe('no route returns a download or attachment URL (store-terms-2026-10-12)', () => {
  it('/api/books/download refuses every file in the catalog with 403, for an owner of everything, and signs nothing', async () => {
    h.rows = BOOKS.flatMap((b) => ['audiobook', 'ebook', 'bundle'].map((format) => ({ bookSlug: b.slug, format, status: 'ACTIVE' })));
    for (const book of BOOKS) {
      for (const file of book.files) {
        const r = await download({ bookSlug: book.slug, fileId: file.id });
        expect(r.status, `${book.slug}/${file.id}`).toBe(403);
        expect(r.json.url).toBeUndefined();
      }
    }
    // it did not even look anyone up
    expect(h.listCalls).toBe(0);
  });

  it('/api/books/stream, asked for every file by an owner of everything, only ever answers inline mp3 URLs', async () => {
    h.rows = BOOKS.flatMap((b) => ['audiobook', 'ebook', 'bundle'].map((format) => ({ bookSlug: b.slug, format, status: 'ACTIVE' })));
    let urls = 0;
    for (const book of BOOKS) {
      for (const file of book.files) {
        const r = await stream({ bookSlug: book.slug, fileId: file.id });
        if (r.status === 200) {
          urls += 1;
          const u = new URL(r.json.url);
          expect(u.searchParams.get('response-content-disposition')).toBe('inline');
          expect(u.pathname.endsWith('.mp3')).toBe(true);
        } else {
          expect(r.json.url).toBeUndefined();
        }
      }
    }
    const mp3s = BOOKS.reduce((n, b) => n + b.files.filter((f) => f.kind === 'mp3').length, 0);
    expect(urls).toBe(mp3s);
  });
});
