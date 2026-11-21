import { describe, expect, it, vi } from 'vitest';
import { CLOUD_RATE, deleteProject, getProject, listProjects, putProject, type CloudRouteDeps } from './cloudRoute';
import { CLOUD_LIMITS } from './cloudSave';
import { STUDIO_DOC_VERSION, type StudioProject } from './doc';
import { everyKindProject } from '@/tests/helpers/nexusStudio';
import { memoryProjectStore, type MemoryProjectStore } from '@/tests/helpers/studioProjectStore';

const NOW = new Date('2026-10-17T12:00:00Z');
const ADULT = NOW.getFullYear() - 30;
const TEEN = NOW.getFullYear() - 16;
const CODE = 'FEL2.' + 'Ab9_-'.repeat(20) + '.abc1234';

function project(): StudioProject {
  const p = everyKindProject();
  p.characters = [{ id: 'char_a', name: 'Nova', lookCode: CODE }];
  return p;
}
const body = (p: unknown, baseRev: unknown = 0) => JSON.stringify({ baseRev, project: p });

function rig(o: Partial<CloudRouteDeps> & { dob?: number | null; store?: MemoryProjectStore } = {}) {
  const store = o.store ?? memoryProjectStore(NOW);
  const dobYear = vi.fn(async () => (o.dob === undefined ? ADULT : o.dob));
  const rateLimit = vi.fn((_k: string, _l: number, _w: number) => ({ ok: true, retryAfterSec: 0 }));
  const log = vi.fn();
  const deps: CloudRouteDeps = { store, userId: 'user_1', writesEnabled: true, dobYear, rateLimit, now: NOW, log, ...o };
  return { deps, store, dobYear, rateLimit, log };
}

describe('the order of checks', () => {
  it('writes switched off: a 404 before the session, the limiter or the age is touched', async () => {
    const r = rig({ writesEnabled: false, userId: null });
    const a = await putProject(r.deps, 'p1', 'garbage');
    expect(a).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect(r.rateLimit).not.toHaveBeenCalled();
    expect(r.dobYear).not.toHaveBeenCalled();
  });

  it('a guest gets 401 from every handler', async () => {
    const r = rig({ userId: null });
    for (const a of [await listProjects(r.deps), await getProject(r.deps, 'p1'), await putProject(r.deps, 'p1', '{}'), await deleteProject(r.deps, 'p1')]) {
      expect(a).toMatchObject({ status: 401 });
    }
  });

  it('the rate limit answers 429 with Retry-After, before the age is read; reads and writes have their own buckets', async () => {
    const r = rig();
    r.rateLimit.mockImplementation((k) => ({ ok: !k.includes(':write:'), retryAfterSec: 7 }));
    const a = await putProject(r.deps, 'p1', body(project()));
    expect(a).toMatchObject({ status: 429, body: { error: 'rate_limited' }, headers: { 'Retry-After': '7' } });
    expect(r.dobYear).not.toHaveBeenCalled();
    expect((await listProjects(r.deps)).status).toBe(200);
    const keys = r.rateLimit.mock.calls.map((c) => c[0]);
    expect(keys).toContain('studio-save:write:minute:user_1');
    expect(keys).toContain('studio-save:read:minute:user_1');
  });

  it('an unknown age, an under-13 and a year that may still be 12 get one neutral 403 and nothing is written, whatever the body', async () => {
    for (const dob of [null, NOW.getFullYear() - 10, NOW.getFullYear() - 12, NOW.getFullYear() - 13]) {
      const r = rig({ dob });
      for (const text of [body(project()), 'not json']) {
        const a = await putProject(r.deps, 'p1', text);
        expect(a).toEqual({ status: 403, body: { error: 'studio_save_unavailable' }, headers: { 'Cache-Control': 'no-store' } });
      }
      expect(r.store.rows.size).toBe(0);
    }
  });

  it('teens 13–17 save under the shipped audience (owner Q1); under the adults-only audience a teen is refused', async () => {
    for (const age of [14, 15, 16, 17]) {
      const r = rig({ dob: NOW.getFullYear() - age });
      const p = project();
      expect((await putProject(r.deps, p.id, body(p))).status).toBe(200);
    }
    const strict = rig({ dob: TEEN, audience: 'adults' });
    expect((await putProject(strict.deps, 'p1', body(project()))).status).toBe(403);
  });
});

describe('saving', () => {
  it('creates at rev 1, stores the sanitised project without look codes, and says how many were left on the device', async () => {
    const r = rig();
    const p = project();
    const a = await putProject(r.deps, p.id, body(p));
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ projectId: p.id, name: p.name, rev: 1, stripped: 1, dropped: 0, updatedAt: NOW.toISOString() });
    expect(a.headers).toMatchObject({ 'Cache-Control': 'no-store' });
    expect(r.rateLimit).toHaveBeenCalledWith('studio-save:write:minute:user_1', CLOUD_RATE.write.minute.limit, CLOUD_RATE.write.minute.windowMs);
    expect(r.rateLimit).toHaveBeenCalledWith('studio-save:write:day:user_1', CLOUD_RATE.write.day.limit, CLOUD_RATE.write.day.windowMs);
    const row = r.store.rows.get('user_1')!.get(p.id)!;
    expect(JSON.stringify(row.doc)).not.toContain('FEL2.');
    expect(row.version).toBe(STUDIO_DOC_VERSION);
    expect(row.bytes).toBe(new TextEncoder().encode(JSON.stringify(row.doc)).length);
  });

  it('an update must name the revision it was based on; a stale one is a 409 that changes nothing', async () => {
    const r = rig();
    const p = project();
    await putProject(r.deps, p.id, body(p, 0));
    const renamed = { ...p, name: 'Second' };
    expect((await putProject(r.deps, p.id, body(renamed, 1))).body).toMatchObject({ rev: 2, name: 'Second' });
    // device B never saw rev 2
    const b = await putProject(r.deps, p.id, body({ ...p, name: 'From B' }, 1));
    expect(b).toMatchObject({ status: 409, body: { error: 'conflict', current: { rev: 2, name: 'Second' } } });
    // a second "create" of the same id is a conflict too, never an overwrite
    expect((await putProject(r.deps, p.id, body(p, 0))).status).toBe(409);
    expect(r.store.rows.get('user_1')!.get(p.id)!.name).toBe('Second');
  });

  it('a push to a project deleted from another device is a 409 with no current row, not a resurrection', async () => {
    const r = rig();
    const p = project();
    await putProject(r.deps, p.id, body(p));
    await deleteProject(r.deps, p.id);
    expect(await putProject(r.deps, p.id, body(p, 1))).toMatchObject({ status: 409, body: { error: 'conflict', current: null } });
    expect(r.store.rows.get('user_1')!.size).toBe(0);
  });

  it('refuses a bad body with the right status and writes nothing', async () => {
    const r = rig();
    const p = project();
    const cases: [string, string, number, string][] = [
      ['bad id', body(p), 400, 'bad_project_id'],
      [p.id, 'not json', 400, 'bad_json'],
      [p.id, body(p, -1), 400, 'bad_base_rev'],
      [p.id, body(p, 1.5), 400, 'bad_base_rev'],
      [p.id, JSON.stringify({ project: p }), 400, 'bad_base_rev'],
      ['proj_other', body(p), 400, 'id_mismatch'],
      [p.id, body({ kind: 'something-else' }), 422, 'invalid_project'],
      [p.id, 'x'.repeat(CLOUD_LIMITS.bodyBytes + 1), 413, 'project_too_large'],
    ];
    for (const [id, text, status, error] of cases) {
      const a = await putProject(r.deps, id === 'bad id' ? 'bad id' : id, text);
      expect([a.status, (a.body as { error: string }).error]).toEqual([status, error]);
    }
    expect(r.store.rows.size).toBe(0);
  });

  it('the quota is checked inside the store\'s write, after the revision: the 21st project is refused', async () => {
    const r = rig();
    for (let i = 0; i < CLOUD_LIMITS.projects; i++) {
      const p = { ...project(), id: `proj_${i}` };
      expect((await putProject(r.deps, p.id, body(p))).status).toBe(200);
    }
    const extra = { ...project(), id: 'proj_extra' };
    expect(await putProject(r.deps, extra.id, body(extra))).toMatchObject({ status: 403, body: { error: 'quota_projects' } });
    expect(r.store.rows.get('user_1')!.size).toBe(CLOUD_LIMITS.projects);
    // a stale write to a full account is still a conflict, not a quota answer (the revision is checked first)
    expect((await putProject(r.deps, 'proj_0', body({ ...project(), id: 'proj_0' }, 7))).status).toBe(409);
    // replacing an existing project in a full account is fine
    expect((await putProject(r.deps, 'proj_0', body({ ...project(), id: 'proj_0', name: 'Again' }, 1))).status).toBe(200);
  });

  it('a store that throws is a 503, and the log line names the event and the error class only', async () => {
    const r = rig();
    r.store.fail = true;
    const p = project();
    expect(await putProject(r.deps, p.id, body(p))).toMatchObject({ status: 503, body: { error: 'save_unavailable' } });
    expect(r.log).toHaveBeenCalledWith('studio_save_put_failed', expect.any(Error));
    expect(JSON.stringify(r.log.mock.calls[0][0])).not.toContain('user_1');
  });
});

describe('reading and deleting what is stored', () => {
  async function seeded() {
    const r = rig();
    const a = project();
    const b = { ...project(), id: 'proj_b', name: 'Newer' };
    await putProject(r.deps, a.id, body(a));
    r.store.clock = new Date(NOW.getTime() + 60_000);
    await putProject(r.deps, b.id, body(b));
    return { r, a, b };
  }

  it('the list is newest first, carries the quota, and never the documents', async () => {
    const { r, a, b } = await seeded();
    const l = await listProjects(r.deps);
    const out = l.body as { projects: { projectId: string }[]; quota: Record<string, number> };
    expect(out.projects.map((x) => x.projectId)).toEqual([b.id, a.id]);
    expect(out.quota).toMatchObject({ projects: 2, maxProjects: CLOUD_LIMITS.projects, maxBytes: CLOUD_LIMITS.accountBytes });
    expect(JSON.stringify(l.body)).not.toMatch(/venues|objects/);
    expect(out).toMatchObject({ saving: { enabled: true, allowed: true } });
  });

  it('the list says whether this account may save: the switch, then the age rule (read only when the switch is on)', async () => {
    const off = rig({ writesEnabled: false });
    expect((await listProjects(off.deps)).body).toMatchObject({ saving: { enabled: false, allowed: false }, projects: [] });
    expect(off.dobYear).not.toHaveBeenCalled();
    expect((await listProjects(rig({ dob: NOW.getFullYear() - 10 }).deps)).body).toMatchObject({ saving: { enabled: true, allowed: false } });
    expect((await listProjects(rig({ dob: null }).deps)).body).toMatchObject({ saving: { enabled: true, allowed: false } });
    expect((await listProjects(rig({ dob: TEEN }).deps)).body).toMatchObject({ saving: { enabled: true, allowed: true } });
  });

  it('a get returns the project through the sanitiser again; another account\'s id is simply not found', async () => {
    const { r, a } = await seeded();
    const g = await getProject(r.deps, a.id);
    expect(g).toMatchObject({ status: 200, body: { rev: 1, project: { id: a.id, characters: [{ id: 'char_a', name: 'Nova' }] } } });
    const other = rig({ store: r.store, userId: 'user_2' });
    expect((await getProject(other.deps, a.id)).status).toBe(404);
    expect((await listProjects(other.deps)).body).toMatchObject({ projects: [] });
  });

  it('a stored document this Studio cannot read is a 422 with its meta, so the creator can still delete it', async () => {
    const { r, a } = await seeded();
    const row = r.store.rows.get('user_1')!.get(a.id)!;
    row.doc = { ...(row.doc as object), version: STUDIO_DOC_VERSION + 1 };
    expect(await getProject(r.deps, a.id)).toMatchObject({ status: 422, body: { error: 'unreadable_project', projectId: a.id } });
  });

  it('delete works with writes switched off and for any age, is idempotent, and touches only this account', async () => {
    const { r, a } = await seeded();
    const otherStore = r.store;
    expect((await putProject(rig({ store: otherStore, userId: 'user_2' }).deps, a.id, body({ ...project(), id: a.id }))).status).toBe(200);
    const off = rig({ store: otherStore, writesEnabled: false, dob: TEEN });
    expect(await deleteProject(off.deps, a.id)).toMatchObject({ status: 200, body: { deleted: true } });
    expect(await deleteProject(off.deps, a.id)).toMatchObject({ status: 200, body: { deleted: false } });
    expect(off.dobYear).not.toHaveBeenCalled();
    expect(otherStore.rows.get('user_2')!.has(a.id)).toBe(true);
  });
});
