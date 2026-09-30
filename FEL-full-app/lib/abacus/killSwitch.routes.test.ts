// ABACUS-KILL (2026-09-29): the AI routes, run for real with the session, the database and fetch as stand-ins.
// Flag unset: each POST answers 503 coming_soon before it reads the session, parses the body or touches prisma (so
// CELL saves no project and no message), and nothing leaves. Flag on: the guard steps aside and the route runs as
// before. ABACUS_ENABLED is unset unless a test sets it, and it is put back afterwards.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ session: { user: { id: 'athlete-1' } } as unknown }));
const getServerSession = vi.hoisted(() => ({ spy: vi.fn(async () => m.session) }));
const prisma = vi.hoisted(() => ({
  models: {
    cellProject: {
      create: vi.fn(async (a: any) => ({ id: 'project-1', title: a.data.title })),
      findFirst: vi.fn(async () => ({ id: 'project-1', title: 't', prompt: 'p', buildPlan: '' })),
      update: vi.fn(async () => ({})),
    },
    cellMessage: { create: vi.fn(async () => ({})), findMany: vi.fn(async () => [{ role: 'user', content: 'hi' }]) },
    cellWisdom: { findMany: vi.fn(async () => [] as unknown[]), create: vi.fn(async () => ({})) },
    projectFile: { findMany: vi.fn(async () => []) },
    lessonProgress: { count: vi.fn(async () => 0) },
    exercise: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock('next-auth', () => ({ getServerSession: getServerSession.spy }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/profile-service', () => ({ getOrCreateProfile: vi.fn(async () => ({ streakDays: 0 })) }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy(prisma.models, {
    get: (t, prop) => {
      if (prop === 'then') return undefined;
      if (!(prop in t)) throw new Error(`the route touched prisma.${String(prop)}`);
      return (t as any)[prop];
    },
  }),
}));

import { POST as cellChatPOST } from '@/app/api/cell/chat/route';
import { POST as cellCompilePOST } from '@/app/api/cell/compile/route';
import { POST as cellFilesPOST } from '@/app/api/cell/projects/[id]/files/route';
import { POST as coachChatPOST } from '@/app/api/coach/chat/route';
import { AI_COMING_SOON_MESSAGE } from '@/lib/abacus/aiStatus';

const saved = { flag: process.env.ABACUS_ENABLED, key: process.env.ABACUSAI_API_KEY };
let fetchSpy: ReturnType<typeof vi.fn>;
let bodyReads: number;

/** A request whose body read is counted, so "the body was never parsed" is measured, not assumed. */
function req(body: unknown): Request {
  const r = new Request('http://localhost/api/x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const json = r.json.bind(r);
  (r as any).json = () => { bodyReads++; return json(); };
  return r;
}

function allPrismaSpies() {
  return Object.values(prisma.models).flatMap((model) => Object.values(model)) as ReturnType<typeof vi.fn>[];
}

function sseResponse(): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'));
        c.enqueue(enc.encode('data: [DONE]\n\n'));
        c.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

beforeEach(() => {
  delete process.env.ABACUS_ENABLED;
  process.env.ABACUSAI_API_KEY = 'test-key-not-real';
  m.session = { user: { id: 'athlete-1' } };
  bodyReads = 0;
  fetchSpy = vi.fn(async () => sseResponse());
  vi.stubGlobal('fetch', fetchSpy);
  getServerSession.spy.mockClear();
  for (const s of allPrismaSpies()) s.mockClear();
});
afterEach(() => {
  if (saved.flag === undefined) delete process.env.ABACUS_ENABLED;
  else process.env.ABACUS_ENABLED = saved.flag;
  if (saved.key === undefined) delete process.env.ABACUSAI_API_KEY;
  else process.env.ABACUSAI_API_KEY = saved.key;
  vi.unstubAllGlobals();
});

const ROUTES = [
  ['POST /api/cell/chat', 'studio', () => cellChatPOST(req({ message: 'build me a game' }))],
  ['POST /api/cell/compile', 'studio', () => cellCompilePOST(req({ projectId: 'project-1' }))],
  ['POST /api/cell/projects/[id]/files', 'studio', () => cellFilesPOST(req({ action: 'regenerate', path: 'index.html' }), { params: { id: 'project-1' } })],
  ['POST /api/coach/chat', 'coach', () => coachChatPOST(req({ messages: [{ role: 'user', content: 'hi' }] }))],
] as const;

describe('flag UNSET: every AI route answers 503 coming_soon and does nothing else', () => {
  it.each(ROUTES)('%s', async (_name, feature, run) => {
    const res = await run();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'coming_soon', feature, message: AI_COMING_SOON_MESSAGE[feature] });
    expect(getServerSession.spy).not.toHaveBeenCalled();
    expect(bodyReads).toBe(0);
    for (const s of allPrismaSpies()) expect(s).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('CELL chat in particular saves no project and no message', async () => {
    await cellChatPOST(req({ message: 'build me a game' }));
    expect(prisma.models.cellProject.create).not.toHaveBeenCalled();
    expect(prisma.models.cellProject.findFirst).not.toHaveBeenCalled();
    expect(prisma.models.cellMessage.create).not.toHaveBeenCalled();
  });
});

describe("ABACUS_ENABLED='true': the guard steps aside and the routes run as before", () => {
  beforeEach(() => {
    process.env.ABACUS_ENABLED = 'true';
  });

  it('POST /api/coach/chat reads the session and reaches the (mocked) Abacus endpoint once', async () => {
    const res = await coachChatPOST(req({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(200);
    await res.text();
    expect(getServerSession.spy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://apps.abacus.ai/v1/chat/completions');
  });

  it('POST /api/cell/chat saves the project and message and reaches the (mocked) Abacus endpoint once', async () => {
    const res = await cellChatPOST(req({ message: 'build me a game' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"content":"hello"');
    expect(prisma.models.cellProject.create).toHaveBeenCalledTimes(1);
    expect(prisma.models.cellMessage.create).toHaveBeenCalledTimes(2); // the user's message, then CELL's
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://apps.abacus.ai/v1/chat/completions');
  });

  it.each([
    ['POST /api/cell/compile', () => cellCompilePOST(req({ projectId: 'project-1' }))],
    ['POST /api/cell/projects/[id]/files', () => cellFilesPOST(req({ action: 'regenerate', path: 'index.html' }), { params: { id: 'project-1' } })],
  ] as const)('%s reads the session as before (signed out: 401, no request)', async (_name, run) => {
    m.session = null;
    const res = await run();
    expect(res.status).toBe(401);
    expect(getServerSession.spy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a route that meets AiDisabledError anyway (the switch flipped mid-request) answers coming_soon, not 500', async () => {
    // cell/chat checks the switch at the top, then again inside callLLM. Flip it off between the two.
    prisma.models.cellWisdom.findMany.mockImplementationOnce(async () => {
      delete process.env.ABACUS_ENABLED;
      return [];
    });
    const res = await cellChatPOST(req({ message: 'build me a game' }));
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe('coming_soon');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
