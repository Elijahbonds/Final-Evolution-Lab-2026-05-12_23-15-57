// The device's half of save-to-account (cloudSync.ts), end to end: two devices (two localStorages) and one account, talking
// through fetchAccountApi to the REAL route handlers (cloudRoute.ts) over the in-memory store — so the wire format, the
// revision rule, the merge and the look-code rule are all the shipped ones.
import { describe, expect, it } from 'vitest';
import {
  BASE_PREFIX, PUSH_MS, SYNC_KEY, deviceSync, fetchAccountApi, hasUnsavedWork, keepBothSides, open, push, pushDelay, reconcile,
  removeFromAccount, saveNew, useMine, useTheirs, type AccountMeta, type SyncCtx,
} from './cloudSync';
import type { StudioProject } from './doc';
import type { KV } from './storage';
import { everyKindProject, memoryKV, placed } from '@/tests/helpers/nexusStudio';
import { studioSaveServer } from '@/tests/helpers/studioProjectStore';

const NOW = new Date('2026-10-17T12:00:00Z');
const CODE = 'FEL2.' + 'Ab9_-'.repeat(20) + '.abc1234';
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function server(o: { dob?: number | null } = {}) {
  const srv = studioSaveServer({ dob: o.dob, now: NOW });
  return { store: srv.store, puts: srv.state.puts, fetchFor: srv.fetchFor, setOffline: (v: boolean) => { srv.state.offline = v; } };
}

async function device(srv: ReturnType<typeof server>, userId = 'u1', kv: KV = memoryKV()) {
  const api = fetchAccountApi(srv.fetchFor(userId));
  const l = await api.list();
  if (!l.ok) throw new Error(`list ${l.status}`);
  const ctx: SyncCtx = { api, device: deviceSync(kv), account: l.account };
  const meta = async (id: string): Promise<AccountMeta | null> => { const x = await api.list(); return x.ok ? x.projects.find((p) => p.projectId === id) ?? null : null; };
  return { ctx, kv, meta };
}

function project(): StudioProject {
  const p = everyKindProject();
  p.characters = [{ id: 'char_a', name: 'Nova', lookCode: CODE }];
  return p;
}

describe('the first save is a click, never automatic', () => {
  it('a project the account has never seen is an OFFER; nothing is sent until "Save to my account"', async () => {
    const srv = server();
    const a = await device(srv);
    const p = project();
    expect(await reconcile(a.ctx, p, null)).toEqual({ kind: 'offer' });
    expect(srv.puts).toEqual([]);
    expect(await saveNew(a.ctx, p)).toEqual({ kind: 'saved', rev: 1, stripped: 1 });
    expect(await reconcile(a.ctx, p, await a.meta(p.id))).toEqual({ kind: 'in-step' });
    expect(JSON.stringify(srv.store.rows.get('u1')!.get(p.id)!.doc)).not.toContain('FEL2.');
  });

  it('a browser shared by two accounts: the second account is offered the project, never sent it', async () => {
    const srv = server();
    const kv = memoryKV();
    const x = await device(srv, 'u1', kv);
    const p = project();
    await saveNew(x.ctx, p);
    const y = await device(srv, 'u2', kv);
    expect(y.ctx.account).not.toBe(x.ctx.account);
    expect(await reconcile(y.ctx, p, await y.meta(p.id))).toEqual({ kind: 'offer' });
    expect(srv.store.rows.get('u2')).toBeUndefined();
    expect(Object.keys(JSON.parse(kv.getItem(SYNC_KEY)!).accounts)).toEqual([x.ctx.account]);
  });
});

describe('two devices', () => {
  it('an edit on one device is pushed; the other device opens it, with look codes only where it has them', async () => {
    const srv = server();
    const a = await device(srv);
    let pa = project();
    await saveNew(a.ctx, pa);
    pa = clone(pa); pa.venues[0].mood = 'dusk';
    expect(await reconcile(a.ctx, pa, await a.meta(pa.id))).toEqual({ kind: 'saved', rev: 2, stripped: 1 });

    const b = await device(srv);
    const opened = await open(b.ctx, pa.id, null);
    if (opened.kind !== 'pulled') throw new Error(opened.kind);
    expect(opened.project.venues[0].mood).toBe('dusk');
    expect(opened.project.characters).toEqual([{ id: 'char_a', name: 'Nova' }]);   // B never had the look
    expect(await reconcile(b.ctx, opened.project, await b.meta(pa.id))).toEqual({ kind: 'in-step' });
  });

  it('different things changed on both: merged automatically, saved, and the other device pulls the merge with its own codes', async () => {
    const srv = server();
    const a = await device(srv);
    const p = project();
    await saveNew(a.ctx, p);
    const b = await device(srv);
    const ob = await open(b.ctx, p.id, null);
    if (ob.kind !== 'pulled') throw new Error(ob.kind);

    const pa = clone(p); pa.venues[0].objects[0].t.p = [4, 0, 4];
    expect((await reconcile(a.ctx, pa, await a.meta(p.id))).kind).toBe('saved');
    const pb = clone(ob.project); pb.venues[0].weather = 'snow'; pb.venues[0].objects.push(placed('fixture:lamp', [2, 0, 2]));
    const merged = await reconcile(b.ctx, pb, await b.meta(p.id));
    if (merged.kind !== 'merged') throw new Error(merged.kind);
    expect(merged.rev).toBe(3);
    expect(merged.project.venues[0].objects[0].t.p).toEqual([4, 0, 4]);
    expect(merged.project.venues[0].weather).toBe('snow');

    const back = await reconcile(a.ctx, pa, await a.meta(p.id));
    if (back.kind !== 'pulled') throw new Error(back.kind);
    expect(back.project.venues[0].weather).toBe('snow');
    expect(back.project.characters[0].lookCode).toBe(CODE);   // A's own code, put back
  });

  it('the same thing changed differently: a named conflict; "keep both" saves this device\'s copy first, then opens the account\'s', async () => {
    const srv = server();
    const a = await device(srv);
    const p = project();
    await saveNew(a.ctx, p);
    const b = await device(srv);
    const ob = await open(b.ctx, p.id, null);
    if (ob.kind !== 'pulled') throw new Error(ob.kind);
    const pa = clone(p); pa.venues[0].objects[1].t.ry = 1;
    await reconcile(a.ctx, pa, await a.meta(p.id));
    const pb = clone(ob.project); pb.venues[0].objects[1].t.ry = 2;
    const c = await reconcile(b.ctx, pb, await b.meta(p.id));
    if (c.kind !== 'conflict') throw new Error(c.kind);
    expect(c.conflicts).toEqual([`obj/${p.venues[0].id}/${p.venues[0].objects[1].id}`]);
    expect(c.theirsRev).toBe(2);

    const kept = await keepBothSides(b.ctx, pb, c.theirs, c.theirsRev, NOW);
    if (kept.kind !== 'kept-both') throw new Error(kept.kind);
    expect(kept.project.venues[0].objects[1].t.ry).toBe(1);
    expect(kept.copy.venues[0].objects[1].t.ry).toBe(2);
    const names = (await b.ctx.api.list()) as { projects: AccountMeta[] };
    expect(names.projects.map((x) => x.projectId).sort()).toEqual([kept.copy.id, p.id].sort());
    expect(await reconcile(b.ctx, kept.project, await b.meta(p.id))).toEqual({ kind: 'in-step' });
  });

  it('"use this device\'s" lands on top of the account\'s revision; "use the account\'s" takes it', async () => {
    const srv = server();
    const a = await device(srv);
    const p = project();
    await saveNew(a.ctx, p);
    const b = await device(srv);
    const ob = await open(b.ctx, p.id, null);
    if (ob.kind !== 'pulled') throw new Error(ob.kind);
    const pa = clone(p); pa.name = 'A'; await reconcile(a.ctx, pa, await a.meta(p.id));
    const pb = clone(ob.project); pb.name = 'B';
    const c = await reconcile(b.ctx, pb, await b.meta(p.id));
    if (c.kind !== 'conflict') throw new Error(c.kind);
    expect(await useMine(b.ctx, pb, c.theirsRev)).toMatchObject({ kind: 'saved', rev: 3 });
    expect(srv.store.rows.get('u1')!.get(p.id)!.name).toBe('B');
    const t = useTheirs(a.ctx, pa, 2);
    expect(t).toEqual({ kind: 'pulled', project: pa });
  });

  it('deleted on one device: the other is told, and only "save it again" brings it back (rev 1)', async () => {
    const srv = server();
    const a = await device(srv);
    const p = project();
    await saveNew(a.ctx, p);
    const b = await device(srv);
    await open(b.ctx, p.id, null);
    expect(await removeFromAccount(a.ctx, p.id)).toBe(true);
    const before = srv.puts.length;
    expect(await reconcile(b.ctx, p, await b.meta(p.id))).toEqual({ kind: 'deleted-elsewhere' });
    expect(srv.puts.length).toBe(before);
    expect(await saveNew(b.ctx, p)).toMatchObject({ kind: 'saved', rev: 1 });
  });

  it('no merge base kept on this device (storage full): a conflict is handed over with no merge, so it keeps both', async () => {
    const srv = server();
    const a = await device(srv);
    const p = project();
    await saveNew(a.ctx, p);
    const inner = memoryKV();
    const noBase: KV = { getItem: (k) => inner.getItem(k), removeItem: (k) => inner.removeItem(k), setItem: (k, v) => { if (k.startsWith(BASE_PREFIX)) throw new Error('QuotaExceededError'); inner.setItem(k, v); } };
    const b = await device(srv, 'u1', noBase);
    const ob = await open(b.ctx, p.id, null);
    if (ob.kind !== 'pulled') throw new Error(ob.kind);
    const pa = clone(p); pa.venues[0].mood = 'dusk'; await reconcile(a.ctx, pa, await a.meta(p.id));
    const pb = clone(ob.project); pb.venues[0].weather = 'snow';   // a different thing: would merge, if there were a base
    expect(await reconcile(b.ctx, pb, await b.meta(p.id))).toMatchObject({ kind: 'conflict', conflicts: [], theirsRev: 2 });
  });

  it('"keep both" changes nothing when the copy cannot be saved (the account is full)', async () => {
    const srv = server();
    const a = await device(srv);
    const p = project();
    await saveNew(a.ctx, p);
    for (let i = 0; i < 19; i++) await saveNew(a.ctx, { ...project(), id: `proj_fill_${i}` });
    const theirs = clone(p); theirs.name = 'Theirs';
    const before = a.kv.getItem(SYNC_KEY);
    expect(await keepBothSides(a.ctx, p, theirs, 1, NOW)).toEqual({ kind: 'error', status: 403, error: 'quota_projects' });
    expect(a.kv.getItem(SYNC_KEY)).toBe(before);
  });
});

describe('offline, timing and the "unsaved work" question', () => {
  it('offline: every call is status 0, never a throw, and the device records are untouched', async () => {
    const srv = server();
    const a = await device(srv);
    const p = project();
    await saveNew(a.ctx, p);
    const rec = a.kv.getItem(SYNC_KEY);
    srv.setOffline(true);
    expect(await a.ctx.api.list()).toEqual({ ok: false, status: 0 });
    const edited = clone(p); edited.name = 'Offline edit';
    expect(await push(a.ctx, edited)).toEqual({ kind: 'error', status: 0, error: 'offline' });
    expect(a.kv.getItem(SYNC_KEY)).toBe(rec);
    srv.setOffline(false);
    expect(await reconcile(a.ctx, edited, await a.meta(p.id))).toMatchObject({ kind: 'saved', rev: 2 });
  });

  it('pushDelay: now on the first push, then at most once per PUSH_MS', () => {
    expect(pushDelay(null, 1000)).toBe(0);
    expect(pushDelay(1000, 1000)).toBe(PUSH_MS);
    expect(pushDelay(1000, 1000 + PUSH_MS / 2)).toBe(PUSH_MS / 2);
    expect(pushDelay(1000, 1000 + PUSH_MS + 5)).toBe(0);
  });

  it('hasUnsavedWork: true for a project the account lacks or has older, false when in step or only behind', async () => {
    const srv = server();
    const a = await device(srv);
    const p = project();
    expect(hasUnsavedWork(a.ctx, p, null)).toBe(true);
    await saveNew(a.ctx, p);
    expect(hasUnsavedWork(a.ctx, p, await a.meta(p.id))).toBe(false);
    const edited = clone(p); edited.name = 'x';
    expect(hasUnsavedWork(a.ctx, edited, await a.meta(p.id))).toBe(true);
    expect(hasUnsavedWork(a.ctx, p, { ...(await a.meta(p.id))!, rev: 9 })).toBe(false);
  });

  it('the device keeps records per account, survives a corrupt key, and a blocked storage is simply "no record"', () => {
    const kv = memoryKV();
    kv.setItem(SYNC_KEY, '{not json');
    const d = deviceSync(kv);
    expect(d.record('acct', 'p')).toBeNull();
    d.setRecord('acct', { projectId: 'p', rev: 2, fingerprint: 'f' });
    expect(d.record('acct', 'p')).toEqual({ projectId: 'p', rev: 2, fingerprint: 'f' });
    expect(d.record('other', 'p')).toBeNull();
    kv.failReads = true;
    expect(d.record('acct', 'p')).toBeNull();
    expect(deviceSync(null).record('acct', 'p')).toBeNull();
  });
});
