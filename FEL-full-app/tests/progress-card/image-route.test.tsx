// PROGRESS CARD: the share image route, run for real (auth and the reads mocked; the next/og renderer is the real one).
// Proven: signed out gets nothing; the owner gets a PNG of their own card that no cache may keep; an under-18 or
// unknown-age account's image never carries a name even when the request asks for one; an adult's name is drawn only
// when ticked; the draw is rate limited per account.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileRows } from '@/lib/profile-v2/assemble';
import { adultTwoWeeks, teenActive, newUser } from '@/tests/helpers/progressCardRows';

const h = vi.hoisted(() => ({ user: 'u1' as string | null, rows: null as unknown, drawn: [] as { card: any; opts: any }[] }));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => (h.user ? { user: { id: h.user } } : null)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/profile-v2/load', async (orig) => ({
  ...(await orig<typeof import('@/lib/profile-v2/load')>()),
  readProfileRows: vi.fn(async () => h.rows),
}));
vi.mock('@/lib/progress-card/image', async (orig) => {
  const real = await orig<typeof import('@/lib/progress-card/image')>();
  return { ...real, ProgressCardImage: (p: { card: any; opts: any }) => { h.drawn.push(p); return real.ProgressCardImage(p); } };
});

import { GET, IMAGE_LIMIT } from '@/app/api/v1/progress-card/image/route';
import { nameOnImage } from '@/lib/progress-card/image';
import { resetRateLimitMemory } from '@/lib/rate-limit';

/** One request, with the body read: next/og draws lazily, as the body is read. */
async function get(q = '') {
  const res = await GET(new Request(`http://localhost/api/v1/progress-card/image${q}`));
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, bytes };
}
const PNG = [0x89, 0x50, 0x4e, 0x47];

beforeEach(() => { h.user = 'u1'; h.rows = adultTwoWeeks(); h.drawn = []; resetRateLimitMemory(); });

describe('GET /api/v1/progress-card/image', () => {
  it('signed out: 401, nothing drawn', async () => {
    h.user = null;
    const res = await get();
    expect(res.status).toBe(401);
    expect(h.drawn).toHaveLength(0);
  });

  it('the owner gets a PNG of their own week, private and never cached', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect([...res.bytes.slice(0, 4)]).toEqual(PNG);
    expect(res.bytes.length).toBeGreaterThan(10_000);
    expect(h.drawn[0].card.headline).toBe('Better on 3 of 5 against last week.');
  });

  it('an adult’s name is off by default and on only when ticked', async () => {
    await get();
    await get('?name=1');
    expect(nameOnImage(h.drawn[0].card, h.drawn[0].opts)).toBeNull();
    expect(nameOnImage(h.drawn[1].card, h.drawn[1].opts)).toBe('Jordan Rig');
  });

  it('a teen’s image never carries a name, even when the request asks', async () => {
    h.rows = teenActive();
    const res = await get('?name=1');
    expect(res.status).toBe(200);
    const { card, opts } = h.drawn[0];
    expect(card.name).toBeNull();
    expect(nameOnImage(card, opts)).toBeNull();
    expect(nameOnImage({ ...card, name: 'Sam Teen' }, opts)).toBeNull();   // the gate holds even if a name slipped in
    expect(JSON.stringify(card)).not.toMatch(/Sam/);
  });

  it('an unknown birth year is treated as under 18', async () => {
    const rows = adultTwoWeeks() as ProfileRows;
    rows.user = { ...rows.user!, dobYear: null };
    h.rows = rows;
    await get('?name=1');
    expect(nameOnImage(h.drawn[0].card, h.drawn[0].opts)).toBeNull();
  });

  it('a new user’s image draws dashes and the new-user line, never a number', async () => {
    h.rows = newUser();
    const res = await get();
    expect(res.status).toBe(200);
    const { card } = h.drawn[0];
    expect(card.state).toBe('new');
    expect(card.metrics.every((m: any) => m.value === null)).toBe(true);
  });

  it('rate limited per account', async () => {
    for (let i = 0; i < IMAGE_LIMIT.count; i++) expect((await get()).status).toBe(200);
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  it('in production too: the next/og default (public, a year) never survives beside ours', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      // headers only: the body is not read, so nothing is drawn under the stubbed env
      const res = await GET(new Request('http://localhost/api/v1/progress-card/image'));
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      await res.body?.cancel();
    } finally { vi.unstubAllEnvs(); }
  });
});
