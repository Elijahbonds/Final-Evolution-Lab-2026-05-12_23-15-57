// COMBINE-DAY: the server half over an in-memory database (tests/helpers/fakeCombineDb.ts), through the real routes
// (next-auth and the database mocked): the pending-SQL fallback, the roster under the team gate, what a save keeps, what
// the coach reads back, and what an athlete sees of their own.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeCombineDb, seedRoster, type FakeCombineDb } from '@/tests/helpers/fakeCombineDb';

const h = vi.hoisted(() => ({ db: null as unknown as FakeCombineDb, user: null as string | null }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (h.db as unknown as Record<string | symbol, unknown>)[p]) }) }));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));

import { GET as listGET, POST as createPOST } from '@/app/api/coach/combine/route';
import { GET as oneGET, PUT as onePUT, DELETE as oneDELETE } from '@/app/api/coach/combine/[id]/route';
import { GET as mineGET } from '@/app/api/combine/mine/route';
import { resetCombineProbe, SQL } from '@/lib/combine/store';
import { resetGroupsProbe } from '@/lib/groups/store';

const Y = new Date().getFullYear();
const J = 'cmj:standing', S = 'sprint:40yd';
const STATIONS = [{ kind: 'cmj', variant: 'standing', attempts: 3 }, { kind: 'sprint', variant: '40yd', attempts: 2 }];
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const req = (method: string, json?: unknown) => new NextRequest('http://fel.test/api/x', { method, ...(json === undefined ? {} : { body: JSON.stringify(json), headers: { 'content-type': 'application/json' } }) });
const out = async (r: Response) => ({ status: r.status, json: (await r.json()) as J });
const list = async () => out(await listGET());
const create = async (body: unknown) => out(await createPOST(req('POST', body)));
const one = async (id: string) => out(await oneGET(req('GET'), { params: { id } }));
const put = async (id: string, body: unknown) => out(await onePUT(req('PUT', body), { params: { id } }));
const del = async (id: string) => out(await oneDELETE(req('DELETE'), { params: { id } }));
const mine = async () => out(await mineGET());
const slot = (value: number | null) => ({ value, at: 1 });
const writes = () => h.db.log.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.q));

beforeEach(() => {
  h.db = fakeCombineDb();
  h.user = 'coach';
  resetCombineProbe();
  resetGroupsProbe();
  seedRoster(h.db, 'coach', 'maya', { name: 'Maya Okafor' });                       // adult, opted in
  seedRoster(h.db, 'coach', 'jo', { name: 'Jo Reyes', optIn: false });              // adult, not opted in
  seedRoster(h.db, 'coach', 'teen', { name: 'Riley', dobYear: Y - 15 });            // 15: held
  seedRoster(h.db, 'coach', 'blank', { name: 'Sam', dobYear: null });               // no birth year: held
  seedRoster(h.db, 'coach', 'kid', { name: 'Kid', dobYear: Y - 11 });               // under 13: never
  seedRoster(h.db, 'coach', 'gone', { name: 'Gone', ended: true });                 // left the roster
  seedRoster(h.db, 'other-coach', 'stranger', { name: 'Stranger' });
  h.db.consents.push({ menteeId: 'teen', requestedAt: new Date(Y - 1, 0, 1), acceptedAt: new Date(Y - 1, 0, 2), revokedAt: null, menteeBirthYear: Y - 15 });
  h.db.groups.push({ id: 'team-1', kind: 'team', ownerId: 'coach', name: 'Varsity', members: [{ userId: 'coach', role: 'owner' }, { userId: 'maya', role: 'member' }, { userId: 'teen', role: 'member' }, { userId: 'stranger', role: 'member' }] });
});

describe('before the pending SQL is applied', () => {
  beforeEach(() => { h.db.tables = false; });

  it('GET still lists the roster and its gates (the combine runs as a phone draft); everything else is 503 or "not available"', async () => {
    const r = await list();
    expect(r.status).toBe(200);
    expect(r.json.available).toBe(false);
    expect(r.json.athletes.map((a: J) => a.id).sort()).toEqual(['blank', 'jo', 'kid', 'maya', 'teen']);
    expect(r.json.events).toEqual([]);
    expect(await create({ name: 'X', stations: STATIONS, athleteIds: ['maya'] })).toMatchObject({ status: 503, json: { error: 'combine_not_ready' } });
    expect(await put('e1', { results: {} })).toMatchObject({ status: 503, json: { error: 'combine_not_ready' } });
    expect(await del('e1')).toMatchObject({ status: 503 });
    expect(await one('e1')).toEqual({ status: 200, json: { available: false } });
    h.user = 'maya';
    expect(await mine()).toEqual({ status: 200, json: { available: false, events: [] } });
    expect(writes()).toEqual([]);
  });
});

describe('the roster, through the team gate', () => {
  it('adults in (camera numbers kept only with the opt-in); every teen held; under 13 never; blank asked; no one off the roster', async () => {
    const { json } = await list();
    const by = Object.fromEntries(json.athletes.map((a: J) => [a.id, a.access]));
    expect(by.maya).toEqual({ testable: true, camera: true, saveCamera: true, held: null });
    expect(by.jo).toEqual({ testable: true, camera: true, saveCamera: false, held: null });
    expect(by.teen).toEqual({ testable: false, camera: false, saveCamera: false, held: 'guardian_consent_required' });
    expect(by.blank.held).toBe('age_required');
    expect(by.kid.held).toBe('under_13');
    expect(by.gone).toBeUndefined();
    expect(by.stranger).toBeUndefined();
    // a team narrows to its members on this roster: the stranger on the team is not this coach's athlete
    expect(json.teams).toEqual([{ id: 'team-1', name: 'Varsity', athleteIds: ['maya', 'teen'] }]);
    // no birth year, no email leaves the server
    expect(JSON.stringify(json)).not.toMatch(/dobYear|@fel|19\d\d/);
  });

  it('before the teams SQL: no teams, the roster as before', async () => {
    h.db.groupsTables = false;
    const { json } = await list();
    expect(json.teams).toEqual([]);
    expect(json.athletes).toHaveLength(5);
  });
});

describe('saving a combine', () => {
  async function made() {
    const r = await create({ name: '  Fall\ttryout ', teamId: 'team-1', stations: [...STATIONS, { kind: 'laser', variant: 'x' }], athleteIds: ['maya', 'jo', 'teen', 'kid', 'stranger', 'gone', 'maya'] });
    expect(r.status).toBe(200);
    return r.json.id as string;
  }

  it('keeps only real stations and athletes the gate passed on this roster', async () => {
    const id = await made();
    expect(h.db.events[0]).toMatchObject({ id, coachId: 'coach', name: 'Fall tryout', teamId: 'team-1', weights: { [J]: 1, [S]: 1 } });
    expect(h.db.events[0].stations.map((s: J) => s.id)).toEqual([J, S]);
    expect(h.db.entrants.map((x) => x.athleteId)).toEqual(['maya', 'jo']);
    expect(await create({ name: 'X', stations: [], athleteIds: ['maya'] })).toMatchObject({ status: 400, json: { error: 'no_stations' } });
    expect(await create({ name: 'X', stations: STATIONS, athleteIds: ['teen'] })).toMatchObject({ status: 400, json: { error: 'no_athletes' } });
  });

  it('a save keeps hand-timed numbers for adults, camera numbers only with the opt-in, numbers only; a redo deletes', async () => {
    const id = await made();
    const r = await put(id, {
      weights: { [J]: 2, [S]: 1 },
      results: {
        maya: { [J]: [{ value: 50.2, at: 1, frames: [[0.1, 0.2]] }, slot(null), null], [S]: [slot(4.81), null] },
        jo: { [J]: [slot(44), null, null], [S]: [slot(5.02), slot(4.97)] },
        teen: { [S]: [slot(5.5), null] },          // held: ignored
        stranger: { [S]: [slot(4.1), null] },      // not on the combine: ignored
      },
    });
    expect(r.status).toBe(200);
    expect(r.json.keptOnDevice).toEqual([{ athleteId: 'jo', stationId: J }]);
    const rows = h.db.results.map((x) => [x.athleteId, x.stationId, x.attempt, x.value, x.method]).sort();
    expect(rows).toEqual([
      ['jo', S, 1, 5.02, 'hand'], ['jo', S, 2, 4.97, 'hand'],
      ['maya', J, 1, 50.2, 'camera'], ['maya', J, 2, null, 'camera'], ['maya', S, 1, 4.81, 'hand'],
    ]);
    // only numbers: no frame or picture reached any statement
    expect(JSON.stringify(h.db.log.map((x) => x.v))).not.toMatch(/frames|0\.1,0\.2|data:image/);
    expect(h.db.events[0].weights).toEqual({ [J]: 2, [S]: 1 });
    // redo: maya's 2nd jump cleared
    await put(id, { results: { maya: { [J]: [slot(50.2), null, null] } } });
    expect(h.db.results.filter((x) => x.athleteId === 'maya' && x.stationId === J).map((x) => x.attempt)).toEqual([1]);
  });

  it('the route asks the scan-save gate itself for each athlete (row 1m): when it says no, the camera number is not kept', async () => {
    const id = await made();
    // the canonical gate reads the opt-in row; the batch read sees a live one through the relation. Make them disagree:
    const real = h.db.scanSaveOptIn.findUnique;
    h.db.scanSaveOptIn.findUnique = async () => { throw new Error('opt-in table unreachable'); };
    const r = await put(id, { results: { maya: { [J]: [slot(50), null, null], [S]: [slot(4.8), null] } } });
    h.db.scanSaveOptIn.findUnique = real;
    expect(r.json.keptOnDevice).toEqual([{ athleteId: 'maya', stationId: J }]);
    expect(h.db.results.map((x) => x.stationId)).toEqual([S]);
  });

  it('the coach reads it back: still-on-roster athletes, a camera number only while the opt-in is live; another coach gets 404', async () => {
    const id = await made();
    await put(id, { results: { maya: { [J]: [slot(50), slot(51), null], [S]: [slot(4.8), null] }, jo: { [S]: [slot(5), null] } } });
    let r = await one(id);
    expect(r.json.event.athletes.map((a: J) => a.id)).toEqual(['maya', 'jo']);
    expect(r.json.event.results.maya[J].map((s: J) => s?.value ?? null)).toEqual([50, 51, null]);
    expect(r.json.event.results.jo[S][0].value).toBe(5);
    // maya revokes the opt-in: her jumps are hidden from the coach, her hand times are not
    h.db.optIns.find((o) => o.userId === 'maya')!.revokedAt = new Date();
    r = await one(id);
    expect(r.json.event.results.maya[J]).toBeUndefined();
    expect(r.json.event.results.maya[S][0].value).toBe(4.8);
    // jo leaves the roster: gone from the coach's view
    h.db.links.find((l) => l.clientId === 'jo')!.endedAt = new Date();
    r = await one(id);
    expect(r.json.event.athletes.map((a: J) => a.id)).toEqual(['maya']);
    h.user = 'other-coach';
    expect((await one(id)).status).toBe(404);
    expect((await put(id, { results: {} })).status).toBe(404);
    expect((await del(id)).status).toBe(404);
  });

  it('a latecomer on the roster joins a saved combine; a held one does not', async () => {
    const id = await made();
    seedRoster(h.db, 'coach', 'late', { name: 'Late' });
    await put(id, { athleteIds: ['late', 'teen'], results: { late: { [S]: [slot(4.9), null] } } });
    expect(h.db.entrants.map((x) => [x.athleteId, x.position])).toEqual([['maya', 0], ['jo', 1], ['late', 2]]);
    expect(h.db.results.map((x) => x.athleteId)).toEqual(['late']);
  });

  it('lists the coach\'s combines and deletes one with everything in it', async () => {
    const id = await made();
    await put(id, { results: { jo: { [S]: [slot(5), null] } } });
    expect((await list()).json.events).toMatchObject([{ id, name: 'Fall tryout', athletes: 2 }]);
    expect(await del(id)).toEqual({ status: 200, json: { deleted: true } });
    expect(h.db.results).toEqual([]);
    expect(h.db.entrants).toEqual([]);
  });
});

describe('the athlete sees their own', () => {
  it('their numbers and their place in the group; no other athlete\'s name or number', async () => {
    const r = await create({ name: 'Tryout', stations: STATIONS, athleteIds: ['maya', 'jo'] });
    await put(r.json.id, { results: { maya: { [J]: [slot(50), slot(52), null], [S]: [slot(5.1), null] }, jo: { [J]: [slot(48), null, null], [S]: [slot(4.9), slot(4.95)] } } });
    h.user = 'jo';
    const m = await mine();
    expect(m.json.available).toBe(true);
    expect(m.json.events).toHaveLength(1);
    const st = Object.fromEntries(m.json.events[0].stations.map((s: J) => [s.id, s]));
    // jo's jump was kept on the coach's phone (no opt-in), so it is not here; the sprint is
    expect(st[J]).toBeUndefined();
    expect(st[S]).toMatchObject({ best: 4.9, attempts: [4.9, 4.95], rank: 1, of: 2 });
    h.user = 'maya';
    const mm = await mine();
    const ms = Object.fromEntries(mm.json.events[0].stations.map((s: J) => [s.id, s]));
    expect(ms[J]).toMatchObject({ best: 52, rank: 1, of: 1 });
    expect(ms[S]).toMatchObject({ best: 5.1, rank: 2, of: 2 });
    // each sees only their own: jo's payload has none of maya's numbers, maya's none of jo's, and no names or ids
    expect(JSON.stringify(m.json)).not.toMatch(/\b5\.1\b|\b5[02]\b|Maya|"maya"|athleteId/);
    expect(JSON.stringify(mm.json)).not.toMatch(/4\.9|\b48\b|Jo Reyes|"jo"|athleteId/);
  });

  it('not on any combine: nothing', async () => {
    h.user = 'stranger';
    expect(await mine()).toEqual({ status: 200, json: { available: true, events: [] } });
  });
});

describe('signed out', () => {
  it('every route is 401', async () => {
    h.user = null;
    expect((await list()).status).toBe(401);
    expect((await create({})).status).toBe(401);
    expect((await one('x')).status).toBe(401);
    expect((await put('x', {})).status).toBe(401);
    expect((await del('x')).status).toBe(401);
    expect((await mine()).status).toBe(401);
  });
});

describe('the statements', () => {
  it('are parameterised: no value from a request is ever in SQL text', async () => {
    const r = await create({ name: "Robert'); DROP TABLE x;--", stations: STATIONS, athleteIds: ['maya'] });
    await put(r.json.id, { name: "'; DELETE FROM", results: { maya: { [S]: [slot(4.8), null] } } });
    const named = new Set<string>(Object.values(SQL));
    for (const x of h.db.log) if (!x.q.includes('information_schema') && !x.q.includes('TrainingGroup')) expect(named.has(x.q), x.q).toBe(true);
  });
});
