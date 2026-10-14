// Track 2's server half: POST /api/cell/venue, run for real with the session, the database and the model as stand-ins.
// The switch first (nothing read, nothing sent); then signed in, a rate limit, adults only, a capped body; the model's answer
// (stubbed: good, hostile, prose) comes back sanitised, never as text.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ session: { user: { id: 'adult-1' } } as unknown, dobYear: 1980 as number | null }));
const getServerSession = vi.hoisted(() => ({ spy: vi.fn(async () => m.session) }));
const prisma = vi.hoisted(() => ({ models: { user: { findUnique: vi.fn(async () => (m.dobYear === undefined ? null : { dobYear: m.dobYear })) } } }));

vi.mock('next-auth', () => ({ getServerSession: getServerSession.spy }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy(prisma.models, {
    get: (t, prop) => {
      if (prop === 'then') return undefined;
      if (!(prop in t)) throw new Error(`the route touched prisma.${String(prop)}`);
      return (t as Record<string | symbol, unknown>)[prop];
    },
  }),
}));

import { POST } from '@/app/api/cell/venue/route';
import { newVenue } from './doc';
import { GOOD_ANSWER, HOSTILE_ANSWER, NIGHT_BEACH_PROMPT, PROSE_ANSWER, completionBody } from '@/tests/helpers/aiVenue';

const saved = { flag: process.env.ABACUS_ENABLED, key: process.env.ABACUSAI_API_KEY };
let fetchSpy: ReturnType<typeof vi.fn>;
let answer = GOOD_ANSWER;
let users = 0;
let bodyReads = 0;

function req(body: unknown, raw?: string): Request {
  const r = new Request('http://localhost/api/cell/venue', { method: 'POST', body: raw ?? JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const text = r.text.bind(r);
  (r as unknown as { text: () => Promise<string> }).text = () => { bodyReads++; return text(); };
  return r;
}
const venue = () => newVenue('Court', { spec: 'tennis', target: 'tiebreak' });

beforeEach(() => {
  delete process.env.ABACUS_ENABLED;
  process.env.ABACUSAI_API_KEY = 'test-key-not-real';
  m.session = { user: { id: `adult-${++users}` } };
  m.dobYear = 1980;
  bodyReads = 0;
  answer = GOOD_ANSWER;
  fetchSpy = vi.fn(async () => completionBody(answer));
  vi.stubGlobal('fetch', fetchSpy);
  getServerSession.spy.mockClear();
  prisma.models.user.findUnique.mockClear();
});
afterEach(() => {
  if (saved.flag === undefined) delete process.env.ABACUS_ENABLED; else process.env.ABACUS_ENABLED = saved.flag;
  if (saved.key === undefined) delete process.env.ABACUSAI_API_KEY; else process.env.ABACUSAI_API_KEY = saved.key;
  vi.unstubAllGlobals();
});

describe('the kill switch', () => {
  it('flag unset: 503 coming soon, before the session, the database or the body; nothing leaves', async () => {
    const res = await POST(req({ prompt: NIGHT_BEACH_PROMPT, venue: venue() }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'coming_soon', feature: 'studio' });
    expect(getServerSession.spy).not.toHaveBeenCalled();
    expect(prisma.models.user.findUnique).not.toHaveBeenCalled();
    expect(bodyReads).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('ABACUS_ENABLED=true', () => {
  beforeEach(() => { process.env.ABACUS_ENABLED = 'true'; });

  it('a good answer comes back as sanitised edits; the model hears the prompt and the venue, not the account', async () => {
    const res = await POST(req({ prompt: NIGHT_BEACH_PROMPT, venue: venue() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dropped).toBe(0);
    expect(body.edits.filter((e: { op: string }) => e.op === 'place')).toHaveLength(8);
    expect(body).not.toHaveProperty('text');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(((fetchSpy.mock.calls[0] as unknown[])[1] as { body: string }).body);
    expect(sent.response_format).toEqual({ type: 'json_object' });
    const words = JSON.stringify(sent.messages);
    expect(words).toContain(NIGHT_BEACH_PROMPT);
    expect(words).not.toContain(String((m.session as { user: { id: string } }).user.id));
  });

  it('a hostile answer: only the vocabulary survives the server', async () => {
    answer = HOSTILE_ANSWER;
    const body = await (await POST(req({ prompt: 'x', venue: venue() }))).json();
    expect(body.dropped).toBe(9);
    expect(JSON.stringify(body)).not.toMatch(/replaceProject|eval|fetch\(|javascript:|polluted|apocalypse/);
  });

  it('prose: no edits, still a 200 (the browser says the answer had nothing to apply)', async () => {
    answer = PROSE_ANSWER;
    expect(await (await POST(req({ prompt: 'x', venue: venue() }))).json()).toEqual({ edits: [], dropped: 0 });
  });

  it('signed out 401; a minor or an unknown age 403 before the body is read or anything is sent', async () => {
    m.session = null;
    expect((await POST(req({ prompt: 'x', venue: venue() }))).status).toBe(401);
    for (const year of [new Date().getFullYear() - 15, null]) {
      m.session = { user: { id: `teen-${++users}` } };
      m.dobYear = year;
      const res = await POST(req({ prompt: 'x', venue: venue() }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'adults_only' });
    }
    expect(bodyReads).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a bad body is refused without a model call: no prompt, too long, no venue, not JSON, too big', async () => {
    const cases: Array<[unknown, string | undefined, number]> = [
      [{ venue: venue() }, undefined, 400], [{ prompt: 'x'.repeat(601), venue: venue() }, undefined, 400],
      [{ prompt: 'x', venue: { base: {} } }, undefined, 400], [null, 'not json', 400], [null, 'x'.repeat(400_001), 413],
    ];
    for (const [b, raw, status] of cases) expect((await POST(req(b, raw))).status).toBe(status);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rate limited per account', async () => {
    let last = 200;
    for (let i = 0; i < 7; i++) last = (await POST(req({ prompt: 'x', venue: venue() }))).status;
    expect(last).toBe(429);
  });

  it('a provider failure is a 502 with no detail', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response('upstream secret detail', { status: 500 }));
    const res = await POST(req({ prompt: 'x', venue: venue() }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'ai_failed' });
  });
});
