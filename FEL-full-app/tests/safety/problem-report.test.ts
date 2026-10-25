// SAFETY lane (SAF-04, 2026-10-25): "Report a problem" lands a row in the admin inbox, and NOTHING in what is sent or
// stored names the person: no account id, no email, no address. Through the real route handler (only the session and
// the database are stand-ins), plus a static scan of the files that build the payload.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSafetyDb, type FakeSafetyState } from '@/tests/helpers/fakeSafetyDb';

const h = vi.hoisted(() => ({ session: null as null | { id: string; role?: string; email?: string }, db: null as any }));
vi.mock('next-auth', () => ({ getServerSession: async () => (h.session ? { user: h.session } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : h.db[k]) }) }));

import { POST, PATCH } from '@/app/api/report/problem/route';
import { resetSafetyProbe } from '@/lib/safety/store';
import { resetRateLimitMemory } from '@/lib/rate-limit';
import { resetBuildId } from '@/lib/safety/buildId';
import { DEVICE_CLASSES, deviceClassOf, parseProblemBody, sanitizeRoute } from '@/lib/safety/problemContext';

const ROOT = join(__dirname, '../..');
const YEAR = new Date().getFullYear();
let st: FakeSafetyState;
let ip = 0;

beforeEach(() => {
  resetSafetyProbe();
  resetRateLimitMemory();
  resetBuildId();
  vi.stubEnv('K_REVISION', 'fel-00042-abc');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const f = fakeSafetyDb({ users: [{ id: 'user-ada-123', dobYear: 1990, email: 'ada@example.test' }, { id: 'user-teen-456', dobYear: YEAR - 15 }] });
  h.db = f.db;
  st = f.state;
  h.session = null;
  ip += 1;
});

const ctx = (o: Record<string, unknown> = {}) => ({ route: '/play/dunk', deviceClass: 'ios-phone', diagKind: 'fps', at: new Date().toISOString(), ...o });
const send = async (body: unknown, from = `10.0.0.${ip}`) => {
  const r = await POST(new Request('http://x/api/report/problem', { method: 'POST', headers: { 'x-forwarded-for': from }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() as Record<string, unknown> };
};

describe('POST /api/report/problem', () => {
  it('lands a row in the admin inbox with the context and the build id the SERVER read', async () => {
    expect(await send(ctx())).toEqual({ status: 200, body: { received: true, stored: true } });
    expect(st.problems).toHaveLength(1);
    expect(st.problems[0]).toMatchObject({ route: '/play/dunk', buildId: 'fel-00042-abc', deviceClass: 'ios-phone', diagKind: 'fps', text: null, status: 'new' });
  });

  it('SCAN: a signed-in adult with a note — nothing stored names them (no id, no email, no address)', async () => {
    h.session = { id: 'user-ada-123', email: 'ada@example.test' };
    const r = await send({ ...ctx({ route: '/u/ada-hoops-99?tab=stats#x' }), text: 'the dunk froze after the second jump', userId: 'user-ada-123', email: 'ada@example.test' }, '203.0.113.9');
    expect(r.body).toEqual({ received: true, stored: true });
    const stored = JSON.stringify(st.problems);
    for (const secret of ['user-ada-123', 'ada@example.test', '203.0.113.9', 'ada-hoops-99', 'tab=stats']) expect(stored).not.toContain(secret);
    expect(st.problems[0]).toMatchObject({ route: '/u/:id', text: 'the dunk froze after the second jump' });
    // and nothing the insert statement carried does either
    const insert = st.statements.find((x) => x.sql.startsWith('INSERT INTO "ProblemReport"'))!;
    expect(insert.values).toHaveLength(7);
    expect(JSON.stringify(insert.values)).not.toMatch(/user-ada-123|@example|203\.0\.113/);
  });

  it('no free text from a minor, or from anyone signed out: the note is dropped and the answer says so', async () => {
    h.session = { id: 'user-teen-456' };
    expect((await send({ ...ctx(), text: 'it keeps crashing' })).body).toEqual({ received: true, stored: true, textDropped: true });
    h.session = null;
    expect((await send({ ...ctx(), text: 'it keeps crashing' })).body).toEqual({ received: true, stored: true, textDropped: true });
    expect(st.problems.map((p) => p.text)).toEqual([null, null]);
  });

  it('an adult\'s note goes through the text screen: contact details and abuse are refused, nothing stored', async () => {
    h.session = { id: 'user-ada-123' };
    for (const text of ['email me at ada@example.test', 'this fucking game']) {
      const r = await send({ ...ctx(), text });
      expect(r.status).toBe(422);
      expect(r.body.error).toBe('text_refused');
    }
    expect(st.problems).toHaveLength(0);
  });

  it('caps the note', async () => {
    h.session = { id: 'user-ada-123' };
    await send({ ...ctx(), text: 'lag '.repeat(400) });
    expect(String(st.problems[0].text).length).toBeLessThanOrEqual(500);
  });

  it('rate-limited: the sixth report from one sender in 15 minutes is refused', async () => {
    for (let i = 0; i < 5; i++) expect((await send(ctx(), '198.51.100.7')).status).toBe(200);
    expect((await send(ctx(), '198.51.100.7')).status).toBe(429);
    expect(st.problems).toHaveLength(5);
  });

  it('a body that is not a report is 400; before the SQL it is received, not stored, never a 500', async () => {
    expect((await send({ route: '/x' })).status).toBe(400);
    expect((await send('nope')).status).toBe(400);
    st.ready = false;
    resetSafetyProbe();
    expect(await send(ctx())).toEqual({ status: 200, body: { received: true, stored: false } });
  });

  it('PATCH (mark handled) is admin only', async () => {
    await send(ctx());
    const patch = (body: unknown) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }));
    h.session = { id: 'user-ada-123', role: 'coach' };
    expect((await patch({ id: st.problems[0].id, status: 'done' })).status).toBe(403);
    h.session = { id: 'admin-1', role: 'admin' };
    expect((await patch({ id: st.problems[0].id, status: 'done' })).status).toBe(200);
    expect(st.problems[0].status).toBe('done');
  });
});

describe('the context', () => {
  it('every id, token, slug and handle in the route becomes :id; query and fragment are dropped', () => {
    expect(sanitizeRoute('/play/dunk')).toBe('/play/dunk');
    expect(sanitizeRoute('/u/jordan-smith')).toBe('/u/:id');
    expect(sanitizeRoute('/consent/guardian/Zx9_kq3LmN0pQrStUvWxYz12AbCdEfGh')).toBe('/consent/guardian/:id');
    expect(sanitizeRoute('/consent/guardian/withdraw/abc.def')).toBe('/consent/guardian/withdraw/:id');
    expect(sanitizeRoute('/squads/clx9a8b7c6d5')).toBe('/squads/:id');
    expect(sanitizeRoute('/coach/dashboard')).toBe('/coach/dashboard');
    expect(sanitizeRoute('/c/AbC123?ref=me@example.com')).toBe('/c/:id');
    expect(sanitizeRoute('/party/ABCD')).toBe('/party/:id');
    expect(sanitizeRoute('/play/mirror/assess')).toBe('/play/mirror/assess');
    expect(sanitizeRoute(42)).toBe('/');
  });

  it('device class is one of nine coarse buckets', () => {
    expect(deviceClassOf({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', maxTouchPoints: 5, shortSide: 390, coarse: true })).toBe('ios-phone');
    expect(deviceClassOf({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', maxTouchPoints: 5, shortSide: 800, coarse: true })).toBe('android-tablet');
    expect(deviceClassOf({ userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0, shortSide: 900, coarse: false })).toBe('other-desktop');
    expect(DEVICE_CLASSES).toHaveLength(9);
  });

  it('only the context keys are read from a body; anything else is ignored', () => {
    const p = parseProblemBody({ ...ctx(), userId: 'u1', email: 'e@x.y', name: 'Ada', ip: '1.2.3.4' })!;
    expect(Object.keys(p).sort()).toEqual(['clientAt', 'deviceClass', 'diagKind', 'route', 'text']);
    expect(JSON.stringify(p)).not.toMatch(/u1|e@x|Ada|1\.2\.3\.4/);
  });

  it('a device clock more than a day off is not kept', () => {
    expect(parseProblemBody(ctx({ at: '2001-01-01T00:00:00Z' }))!.clientAt).toBeNull();
  });
});

describe('STATIC SCAN: the client never puts a person into the payload', () => {
  const strip = (src: string) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  it('report-problem.tsx and problemContext.ts read no session, account id, email or name', () => {
    for (const f of ['components/report/report-problem.tsx', 'lib/safety/problemContext.ts']) {
      const code = strip(readFileSync(join(ROOT, f), 'utf8'));
      expect(code, f).not.toMatch(/useSession|getServerSession|next-auth|userId|\.email|localStorage|document\.cookie|\.name\b/);
    }
  });
  it('the client body is the context plus an optional typed text, nothing else', () => {
    const code = strip(readFileSync(join(ROOT, 'components/report/report-problem.tsx'), 'utf8'));
    expect(code).toMatch(/const body = \{ \.\.\.problemContext\(\), \.\.\.\(allowText && text\.trim\(\) \? \{ text: text\.trim\(\) \} : \{\}\) \};/);
    const ctxFn = code.slice(code.indexOf('export function problemContext'), code.indexOf('export function ReportProblem'));
    expect([...ctxFn.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]).sort()).toEqual(['at', 'deviceClass', 'diagKind', 'route']);
  });
  it('the stored row has no person column (the pending SQL), so the data-rights scan finds none', () => {
    const sql = readFileSync(join(ROOT, 'prisma/pending/2026-10-25-user-reports.sql'), 'utf8');
    const table = sql.slice(sql.indexOf('CREATE TABLE "ProblemReport"'), sql.indexOf('CONSTRAINT "ProblemReport_pkey"'));
    expect(table).not.toMatch(/userId|email|ip|address|reporter/i);
  });
});
