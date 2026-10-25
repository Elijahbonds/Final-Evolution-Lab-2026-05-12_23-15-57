// TEAMS-SQUADS: the five route files, through their real handlers, on the database BEFORE the pending SQL (no tables):
// a clear "not yet" (200 available:false, or 503 groups_not_ready), never a 500; signed out is 401; bad JSON is 400.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeGroupsDb, YEARS } from '@/tests/helpers/fakeGroupsDb';

const h = vi.hoisted(() => ({ userId: null as string | null, db: null as any }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.userId,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.db[p]) }) }));

import { GET as list, POST as create } from '@/app/api/groups/route';
import { GET as preview, POST as join } from '@/app/api/groups/join/route';
import { GET as one, PATCH as edit, DELETE as remove } from '@/app/api/groups/[id]/route';
import { POST as members } from '@/app/api/groups/[id]/members/route';
import { POST as act } from '@/app/api/groups/[id]/act/route';
import { resetGroupsProbe } from '@/lib/groups/store';
import { NextRequest } from 'next/server';

const req = (body?: unknown, url = 'http://x/api/groups') =>
  new NextRequest(url, { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
const ctx = { params: { id: 'g1' } };

beforeEach(() => {
  resetGroupsProbe();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  h.userId = 'ada';
  h.db = fakeGroupsDb({ ready: false, users: [{ id: 'ada', name: 'Ada', dobYear: YEARS.adult }] }).db;
});

describe('the group routes before the pending SQL is applied', () => {
  it('reads: 200 { available: false }', async () => {
    for (const r of [await list(), await one(req(), ctx), await preview(req(undefined, 'http://x/api/groups/join?token=abc'))]) {
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ available: false });
    }
  });
  it('writes: 503 groups_not_ready with a plain "coming soon", never a 500', async () => {
    const calls = [
      await create(req({ kind: 'squad', name: 'Swift Falcons', color: 'cyan' })),
      await join(req({ code: 'ABCD-2345' })),
      await edit(req({ color: 'gold' }), ctx),
      await remove(req(), ctx),
      await members(req({ action: 'leave' }), ctx),
      await act(req({ kind: 'duo', with: 'ben', target: 3 }), ctx),
    ];
    for (const r of calls) {
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: 'groups_not_ready', message: 'Squads and teams are coming soon.' });
    }
  });
  it('signed out: 401; a body that is not JSON: 400', async () => {
    expect((await create(req('{not json'))).status).toBe(400);
    h.userId = null;
    for (const r of [await list(), await create(req({})), await join(req({})), await one(req(), ctx), await act(req({}), ctx), await members(req({}), ctx)]) expect(r.status).toBe(401);
  });
});

describe('the group routes once the tables are there', () => {
  it('create → view → the invite preview, through the handlers', async () => {
    const f = fakeGroupsDb({ users: [{ id: 'ada', name: 'Ada', dobYear: YEARS.adult }] });
    h.db = f.db;
    const made = await create(req({ kind: 'squad', name: 'Swift Falcons', color: 'cyan' }));
    expect(made.status).toBe(201);
    const { id } = await made.json();
    const v = await one(req(), { params: { id } });
    expect((await v.json()).group).toMatchObject({ name: 'Swift Falcons', kind: 'squad', me: { role: 'owner' } });
    const token = String(f.state.groups[0].inviteToken);
    const p = await preview(req(undefined, `http://x/api/groups/join?token=${encodeURIComponent(token)}`));
    expect(await p.json()).toMatchObject({ available: true, name: 'Swift Falcons' });
  });
});
