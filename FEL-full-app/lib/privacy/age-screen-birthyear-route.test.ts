// AGE-SCREEN: GET/POST /api/account/birth-year. A blank year is written once. A set year is never changed. Nothing is deleted.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ prisma: null as any, db: null as any, session: null as any, cookie: null as string | null }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (h.cookie && name === 'fel_age_gate' ? { name, value: h.cookie } : undefined) }),
}));

import { GET, POST } from '@/app/api/account/birth-year/route';
import { newSpyDb, seedUser, spyPrisma, writesOf, type SpyDb } from '@/tests/helpers/writeSpyDb';

const UID = 'acct-1';
const THIS_YEAR = new Date().getFullYear();

async function post(birthYear: unknown) {
  const req = new Request('http://fel.test/api/account/birth-year', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ birthYear }),
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json(), cookie: res.headers.get('set-cookie') };
}
async function get() {
  const res = await GET();
  return { status: res.status, json: await res.json() };
}

describe('/api/account/birth-year', () => {
  beforeEach(() => {
    h.db = newSpyDb();
    seedUser(h.db, UID, null);
    h.prisma = spyPrisma(h.db);
    h.session = { user: { id: UID } };
    h.cookie = null;
  });

  it('GET needed when the year is blank, and blocked after an under-13 lock, never the year', async () => {
    const open = await get();
    expect(open.status).toBe(200);
    expect(open.json).toEqual({ needed: true, blocked: false });
    expect(JSON.stringify(open.json)).not.toMatch(/dobYear|birthYear/);

    h.db.tables.user[0].dobYear = THIS_YEAR - 12;
    const locked = await get();
    expect(locked.json).toEqual({ needed: false, blocked: true });
    expect(JSON.stringify(locked.json)).not.toContain(String(THIS_YEAR - 12));
  });

  it('POST sets a null dobYear once; a second POST → 409 and no update', async () => {
    const year = THIS_YEAR - 16;
    const first = await post(year);
    expect(first.status).toBe(200);
    expect(h.db.tables.user[0].dobYear).toBe(year);
    const writes = writesOf(h.db as SpyDb);
    const again = await post(1990);
    expect(again.status).toBe(409);
    expect(again.json).toEqual({ error: 'birth_year_locked' });
    expect(h.db.tables.user[0].dobYear).toBe(year);
    expect(writesOf(h.db as SpyDb)).toEqual(writes);
  });

  it('cookie → 403, no write', async () => {
    h.cookie = '1';
    const r = await post(1990);
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'age_screen_blocked' });
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBeNull();
  });

  it('invalid → 400', async () => {
    const r = await post(1899);
    expect(r.status).toBe(400);
    expect(writesOf(h.db as SpyDb)).toEqual([]);
    expect(h.db.tables.user[0].dobYear).toBeNull();
  });

  it('under 13 → 403 + Set-Cookie, dobYear locked; a later adult POST does not update', async () => {
    const year = THIS_YEAR - 13;
    const r = await post(year);
    expect(r.status).toBe(403);
    expect(r.cookie).toContain('fel_age_gate=1');
    expect(h.db.tables.user[0].dobYear).toBe(year);
    const later = await post(1990);
    expect([403, 409]).toContain(later.status);
    expect(h.db.tables.user[0].dobYear).toBe(year);
    const after = await get();
    expect(after.json.blocked).toBe(true);
  });

  it('signed out → 401', async () => {
    h.session = null;
    expect((await get()).status).toBe(401);
    expect((await post(1990)).status).toBe(401);
    expect(writesOf(h.db as SpyDb)).toEqual([]);
  });

  it('zero deletes', async () => {
    await post(THIS_YEAR - 15);
    await post(1990);
    expect(writesOf(h.db as SpyDb).some((op) => op.includes('delete'))).toBe(false);
  });
});
