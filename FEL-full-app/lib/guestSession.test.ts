// TIP-GUEST-TOKEN-HASH (2026-10-19): lookup by the token's hash before and after prisma/pending/2026-10-19-guest-token-
// hash-1-add.sql and -2-clear-raw.sql. The database is an in-memory stand-in that answers the three raw statements
// lib/guestSession.ts sends (the probe, the lookup, the stamp) the way Postgres would, with or without the column. The
// two SQL files are NOT run here (no database is touched); `applyFile1`/`applyFile2` below re-state their UPDATEs in JS so
// the sequence can be walked, and the last test pins the SQL text those re-statements copy.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashGuestToken, mintGuestToken } from './guest';
import { createGuestSession, findGuestSession, guestIdFrom, guestTokenFrom, resetGuestTokenHashProbe, setGuestCookie, type GuestDb } from './guestSession';

type Row = { id: string; token: string; tokenHash?: string | null; migratedUserId: string | null };

function fakeDb(opts: { column: boolean }) {
  const rows: Row[] = [];
  const raw: string[] = [];
  const missing = () => Object.assign(new Error('column "tokenHash" does not exist'), { code: '42703' });
  const db: GuestDb & { rows: Row[]; raw: string[]; column: boolean } = {
    rows, raw, column: opts.column,
    async $queryRawUnsafe<T>(sql: string, ...v: unknown[]): Promise<T> {
      raw.push(sql);
      if (sql.includes('information_schema.columns')) return (db.column ? [{ ok: 1 }] : []) as T;
      if (!db.column) throw missing();
      const hit = rows.find((r) => r.tokenHash === v[0] || r.token === v[0]);
      return (hit ? [{ id: hit.id, migratedUserId: hit.migratedUserId }] : []) as T;
    },
    async $executeRawUnsafe(sql: string, ...v: unknown[]) {
      raw.push(sql);
      if (!db.column) throw missing();
      const r = rows.find((x) => x.id === v[1] && x.tokenHash == null);
      if (r) r.tokenHash = v[0] as string;
      return r ? 1 : 0;
    },
    guestSession: {
      async findUnique(a) {
        const r = rows.find((x) => x.token === a.where.token);
        return r ? { id: r.id, migratedUserId: r.migratedUserId } : null;
      },
      async create(a) {
        const r: Row = { id: `g${rows.length + 1}`, token: a.data.token, migratedUserId: null, ...(db.column ? { tokenHash: null } : {}) };
        rows.push(r);
        return { id: r.id, migratedUserId: null };
      },
      async update() { return {}; },
    },
  };
  return db;
}

// prisma/pending/2026-10-19-guest-token-hash-1-add.sql / -2-clear-raw.sql, restated (see the file header).
const HEX64 = /^[0-9a-f]{64}$/;
function applyFile1(db: ReturnType<typeof fakeDb>) {
  db.column = true;
  for (const r of db.rows) if (r.tokenHash == null) r.tokenHash = HEX64.test(r.token) ? r.token : hashGuestToken(r.token);
}
function applyFile2(db: ReturnType<typeof fakeDb>) {
  for (const r of db.rows) if (r.tokenHash == null) r.tokenHash = HEX64.test(r.token) ? r.token : hashGuestToken(r.token);
  for (const r of db.rows) r.token = r.tokenHash!;
}

beforeEach(() => { resetGuestTokenHashProbe(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('findGuestSession / createGuestSession', () => {
  it('before file 1: a new row stores the hash in "token", is found by it, and nothing touches "tokenHash"', async () => {
    const db = fakeDb({ column: false });
    const t = mintGuestToken();
    const h = hashGuestToken(t);
    const made = await createGuestSession(db, h);
    expect(db.rows[0].token).toBe(h);
    expect(JSON.stringify(db.rows)).not.toContain(t);
    expect(await findGuestSession(db, h)).toEqual({ id: made.id, migratedUserId: null });
    expect(db.raw.filter((s) => /"tokenHash" =/.test(s))).toEqual([]);   // only the probe went out raw
  });

  it('before file 1: a pre-hash row (raw token) is not found by its hash, so the guest is minted afresh', async () => {
    const db = fakeDb({ column: false });
    const old = mintGuestToken();
    db.rows.push({ id: 'pre', token: old, migratedUserId: null });
    expect(await findGuestSession(db, hashGuestToken(old))).toBeNull();
    expect(await findGuestSession(db, old)).toEqual({ id: 'pre', migratedUserId: null });   // control: the row is there
  });

  it('after file 1: the pre-hash row IS found by its hash (tokenHash), and new rows stamp tokenHash', async () => {
    const db = fakeDb({ column: false });
    const old = mintGuestToken();
    db.rows.push({ id: 'pre', token: old, migratedUserId: 'u-1' });
    const fresh = hashGuestToken(mintGuestToken());
    await createGuestSession(db, fresh);                 // written by the new code before file 1
    applyFile1(db);
    resetGuestTokenHashProbe();                           // the probe's TTL passing
    expect(await findGuestSession(db, hashGuestToken(old))).toEqual({ id: 'pre', migratedUserId: 'u-1' });
    expect(db.rows[1].tokenHash).toBe(fresh);             // copied as is, not hashed twice
    expect(await findGuestSession(db, fresh)).toEqual({ id: 'g2', migratedUserId: null });
    const later = hashGuestToken(mintGuestToken());
    await createGuestSession(db, later);
    expect(db.rows[2]).toMatchObject({ token: later, tokenHash: later });
    expect(await findGuestSession(db, later)).toEqual({ id: 'g3', migratedUserId: null });
  });

  it('after file 2: no stored value equals any raw token, and every guest is still found', async () => {
    const db = fakeDb({ column: false });
    const tokens = [mintGuestToken(), mintGuestToken(), mintGuestToken()];
    db.rows.push({ id: 'pre', token: tokens[0], migratedUserId: null });
    await createGuestSession(db, hashGuestToken(tokens[1]));
    applyFile1(db);
    // a row written in the window before the probe noticed the column: hash in token, no tokenHash yet
    await createGuestSession({ ...db, column: false } as GuestDb, hashGuestToken(tokens[2]));
    db.rows[2].tokenHash = null;
    applyFile2(db);
    resetGuestTokenHashProbe();
    for (const r of db.rows) { expect(r.token).toMatch(HEX64); expect(r.tokenHash).toBe(r.token); }
    for (const t of tokens) {
      expect(JSON.stringify(db.rows)).not.toContain(t);
      expect(await findGuestSession(db, hashGuestToken(t))).not.toBeNull();
    }
  });

  it('a lookup that finds the column gone falls back to "token" instead of failing the request', async () => {
    const db = fakeDb({ column: true });
    const h = hashGuestToken(mintGuestToken());
    await createGuestSession(db, h);
    db.column = false;   // the probe still says yes (cached); the statement says 42703
    expect(await findGuestSession(db, h)).toEqual({ id: 'g1', migratedUserId: null });
  });

  it('the SQL files say what the restatements above do (and are never run by this suite)', () => {
    const dir = path.resolve(__dirname, '../prisma/pending');
    const f1 = readFileSync(path.join(dir, '2026-10-19-guest-token-hash-1-add.sql'), 'utf8');
    const f2 = readFileSync(path.join(dir, '2026-10-19-guest-token-hash-2-clear-raw.sql'), 'utf8');
    expect(f1).toMatch(/ALTER TABLE "GuestSession" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;/);
    expect(f1).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "GuestSession_tokenHash_key" ON "GuestSession"\("tokenHash"\);/);
    const noDoubleHash = /CASE WHEN "token" ~ '\^\[0-9a-f\]\{64\}\$' THEN "token"\s+ELSE encode\(sha256\(convert_to\("token", 'UTF8'\)\), 'hex'\) END\s+WHERE "tokenHash" IS NULL;/;
    expect(f1).toMatch(noDoubleHash);
    expect(f2).toMatch(noDoubleHash);
    expect(f2.indexOf('WHERE "tokenHash" IS NULL')).toBeLessThan(f2.indexOf('SET "token" = "tokenHash"'));
    for (const f of [f1, f2]) {
      expect(f).toMatch(/WHERE "guestId" IS NOT NULL AND "guestId" !~ '\^\[0-9a-f\]\{64\}\$';/);
      expect(f).not.toMatch(/\bDROP\b/i);
    }
    // the schema line is held for TIP-SCHEMA-SYNC-DOB-TOKENHASH
    expect(readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8')).not.toContain('tokenHash');
  });
});

describe('the cookie helpers', () => {
  const jar = (c: Record<string, string>) => {
    const sets: Array<[string, string, Record<string, unknown> | undefined]> = [];
    return { sets, get: (n: string) => (n in c ? { value: c[n] } : undefined), set: (n: string, v: string, o?: Record<string, unknown>) => { sets.push([n, v, o]); } };
  };
  it('ignores a malformed cookie and hashes a well-formed one', () => {
    const t = mintGuestToken();
    expect(guestTokenFrom(jar({ fel_guest: 'junk' }))).toBeNull();
    expect(guestIdFrom(jar({ fel_guest: 'junk' }))).toBeNull();
    expect(guestIdFrom(jar({ fel_guest: t }))).toBe(hashGuestToken(t));
  });
  it('in production reads __Host-fel_guest first, a legacy fel_guest once, and expires the legacy one on re-issue', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const a = mintGuestToken();
    const b = mintGuestToken();
    expect(guestTokenFrom(jar({ '__Host-fel_guest': a, fel_guest: b }))).toEqual({ token: a, legacy: false });
    expect(guestTokenFrom(jar({ fel_guest: b }))).toEqual({ token: b, legacy: true });
    const j = jar({ fel_guest: b });
    setGuestCookie(j, b);
    expect(j.sets).toEqual([
      ['__Host-fel_guest', b, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 2592000 }],
      ['fel_guest', '', { path: '/', maxAge: 0 }],
    ]);
    vi.unstubAllEnvs();
  });
});
