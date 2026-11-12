// The Studio's "save to account" panel (account-save.tsx): its hook on the test hook runtime (no DOM), talking to the REAL
// route handlers through the shared fake server, and its view as markup for each state. Owner answers 2026-10-17: Q1 teens
// 13+ and adults, Q2 no look codes in the account, Q3 merge or keep both, Q9 the panel hides when saving is off.
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mount } from '@/tests/helpers/hookRuntime';
import { AccountSaveView, accountErrorText, useAccountSave, type AccountSaveApi } from './account-save';
import { createStack, execute, type Command } from '@/lib/nexus-studio/commands';
import { deviceSync, fetchAccountApi, open, saveNew } from '@/lib/nexus-studio/cloudSync';
import type { StudioProject } from '@/lib/nexus-studio/doc';
import { everyKindProject, memoryKV } from '@/tests/helpers/nexusStudio';
import { studioSaveServer } from '@/tests/helpers/studioProjectStore';

const NOW = new Date('2026-10-17T12:00:00Z');
const CODE = 'FEL2.' + 'Ab9_-'.repeat(20) + '.abc1234';
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const flush = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

function project(): StudioProject {
  const p = everyKindProject();
  p.characters = [{ id: 'char_a', name: 'Nova', lookCode: CODE }];
  return p;
}

function fakeStudio(doc: StudioProject) {
  const s = {
    doc, loaded: true, ran: [] as Command[],
    run(cmd: Command) { s.ran.push(cmd); s.doc = execute(createStack(s.doc), cmd).doc; },
    setSelected() {},
  };
  return s;
}

function rig(o: { doc?: StudioProject; srv?: ReturnType<typeof studioSaveServer>; user?: string | null; kv?: ReturnType<typeof memoryKV> } = {}) {
  const srv = o.srv ?? studioSaveServer({ now: NOW });
  const kv = o.kv ?? memoryKV();
  const studio = fakeStudio(o.doc ?? project());
  const clock = { t: 1_000_000 };
  const now = () => clock.t;
  const api = fetchAccountApi(srv.fetchFor(o.user === undefined ? 'u1' : o.user));
  let a!: AccountSaveApi;
  const m = mount(() => { a = useAccountSave(studio, { api, kv, now }); return null; });
  const view = () => renderToStaticMarkup(createElement(AccountSaveView, { a }));
  return { srv, kv, studio, clock, m, get a() { return a; }, view };
}

describe('when the panel shows at all', () => {
  it('a guest (401) and an account with saving off and nothing saved: nothing is rendered', async () => {
    const guest = rig({ user: null });
    await flush();
    expect(guest.a.state.status).toBe('hidden');
    expect(guest.view()).toBe('');
    const off = rig({ srv: studioSaveServer({ enabled: false, now: NOW }) });
    await flush();
    expect(off.a.state.status).toBe('hidden');
    expect(off.view()).toBe('');
    guest.m.unmount(); off.m.unmount();
  });

  it('saving off but projects saved before: the list stays, to open or delete, and it says saving is off', async () => {
    const srv = studioSaveServer({ now: NOW });
    const p = project();
    const kv = memoryKV();
    await saveNew({ api: fetchAccountApi(srv.fetchFor('u1')), device: deviceSync(kv), account: ((await fetchAccountApi(srv.fetchFor('u1')).list()) as { account: string }).account }, p);
    srv.state.enabled = false;
    const r = rig({ srv, doc: project() });
    await flush();
    expect(r.a.state.status).toBe('idle');
    r.a.togglePanel(); await flush();
    const html = r.view();
    expect(html).toContain('switched off right now');
    expect(html).toContain(`Open ${p.name}`);
    expect(html).toContain(`Delete ${p.name}`);
    expect(html).not.toContain('Save to my account');
    r.m.unmount();
  });

  it('an under-13 or an unknown age (the database\'s): a neutral line, no save button, and no age named', async () => {
    for (const dob of [NOW.getFullYear() - 10, null]) {
      const r = rig({ srv: studioSaveServer({ dob, now: NOW }) });
      await flush();
      // nothing saved and not allowed: the switch is on, so the panel exists to say so
      expect(r.a.state.status).toBe('idle');
      r.a.togglePanel(); await flush();
      const html = r.view();
      expect(html).toContain('isn’t available for this account');
      expect(html).not.toMatch(/\b(age|13|18|teen|adult|birth)\b/i);
      expect(html).not.toContain('Save to my account');
      expect(r.srv.state.puts).toEqual([]);
      r.m.unmount();
    }
  });
});

describe('saving', () => {
  it('a teen (16) is offered the save; nothing goes up until the click; then it is in the account without look codes', async () => {
    const r = rig({ srv: studioSaveServer({ dob: NOW.getFullYear() - 16, now: NOW }) });
    await flush();
    expect(r.a.state.status).toBe('offer');
    expect(r.srv.state.puts).toEqual([]);
    r.a.togglePanel(); await flush();
    expect(r.view()).toContain('data-testid="save-to-account"');
    await r.a.saveToAccount(); await flush();
    expect(r.a.state.status).toBe('in-account');
    expect(r.a.state.note).toMatch(/Character looks stay on this device/);
    expect(r.srv.state.puts).toEqual([r.studio.doc.id]);
    expect(JSON.stringify(r.srv.store.rows.get('u1')!.get(r.studio.doc.id)!.doc)).not.toContain('FEL2.');
    expect(r.view()).toContain('1 of 20');
    r.m.unmount();
  });

  it('an edit goes up on its own (throttled), with no click', async () => {
    const r = rig();
    await flush();
    await r.a.saveToAccount(); await flush();
    r.clock.t += 60_000;   // past the throttle
    r.studio.run({ label: 'Rename', ops: [{ op: 'setName', name: 'Edited here' }] });
    r.a.togglePanel(); await flush();   // any render: the panel sees the new document
    expect(r.srv.store.rows.get('u1')!.get(r.studio.doc.id)!.name).toBe('Edited here');
    expect(r.srv.store.rows.get('u1')!.get(r.studio.doc.id)!.rev).toBe(2);
    expect(r.a.state.status).toBe('in-account');
    r.m.unmount();
  });

  it('a change made on another device comes down as ONE undoable command, with this device\'s look codes', async () => {
    const srv = studioSaveServer({ now: NOW });
    const kv = memoryKV();
    const p = project();
    const r1 = rig({ srv, kv, doc: p });
    await flush();
    await r1.a.saveToAccount(); await flush();
    r1.m.unmount();
    // another device edits it
    const other = fetchAccountApi(srv.fetchFor('u1'));
    const acct = ((await other.list()) as { account: string }).account;
    const octx = { api: other, device: deviceSync(memoryKV()), account: acct };
    const ob = await open(octx, p.id, null);
    if (ob.kind !== 'pulled') throw new Error(ob.kind);
    const theirs = clone(ob.project); theirs.venues[0].mood = 'dusk';
    expect((await other.put(theirs, 1)).ok).toBe(true);
    // this device opens the Studio again
    const r2 = rig({ srv, kv, doc: r1.studio.doc });
    await flush();
    expect(r2.studio.ran).toHaveLength(1);
    expect(r2.studio.ran[0]).toMatchObject({ label: 'Load from your account', ops: [{ op: 'replaceProject' }] });
    expect(r2.studio.doc.venues[0].mood).toBe('dusk');
    expect(r2.studio.doc.characters[0].lookCode).toBe(CODE);
    r2.m.unmount();
  });
});

describe('conflicts (owner Q3: merge, otherwise keep both)', () => {
  async function conflicted() {
    const srv = studioSaveServer({ now: NOW });
    const kv = memoryKV();
    const p = project();
    const r1 = rig({ srv, kv, doc: p });
    await flush();
    await r1.a.saveToAccount(); await flush();
    r1.m.unmount();
    const other = fetchAccountApi(srv.fetchFor('u1'));
    const theirs = clone(p); theirs.venues[0].objects[0].t.ry = 2; theirs.characters = [{ id: 'char_a', name: 'Nova' }];
    expect((await other.put(theirs, 1)).ok).toBe(true);
    const mine = clone(r1.studio.doc); mine.venues[0].objects[0].t.ry = 1;
    const r2 = rig({ srv, kv, doc: mine });
    await flush();
    return { srv, r2, p };
  }

  it('the same object changed on both: the panel opens on the conflict and offers keep both first', async () => {
    const { r2 } = await conflicted();
    expect(r2.a.state.status).toBe('conflict');
    expect(r2.a.state.panelOpen).toBe(true);
    const html = r2.view();
    expect(html).toContain('Nothing has been overwritten');
    expect(html.indexOf('Keep both')).toBeLessThan(html.indexOf('Use this device’s'));
    expect(r2.studio.ran).toEqual([]);
    r2.m.unmount();
  });

  it('keep both: this device\'s version is saved as a new project, then the account\'s copy opens (one command)', async () => {
    const { srv, r2, p } = await conflicted();
    r2.a.keepBoth(); await flush();
    expect(r2.a.state.status).toBe('in-account');
    expect(r2.studio.ran).toHaveLength(1);
    expect(r2.studio.doc.venues[0].objects[0].t.ry).toBe(2);
    const rows = [...srv.store.rows.get('u1')!.values()];
    expect(rows).toHaveLength(2);
    const copy = rows.find((x) => x.projectId !== p.id)!;
    expect(copy.name).toMatch(/\(this device\)$/);
    expect((copy.doc as StudioProject).venues[0].objects[0].t.ry).toBe(1);
    expect(r2.a.state.note).toMatch(/saved to your account as/);
    r2.m.unmount();
  });
});

describe('the saved-projects list', () => {
  it('opening another project with unsaved work here asks first; "Open anyway" opens it as one command', async () => {
    const srv = studioSaveServer({ now: NOW });
    const kv = memoryKV();
    const other = project(); other.name = 'Other venue';
    const api = fetchAccountApi(srv.fetchFor('u1'));
    await saveNew({ api, device: deviceSync(memoryKV()), account: ((await api.list()) as { account: string }).account }, other);
    const r = rig({ srv, kv });   // the working project has never been saved to the account: unsaved work
    await flush();
    r.a.togglePanel(); await flush();
    r.a.requestOpen(other.id); await flush();
    expect(r.a.state.confirm).toMatchObject({ kind: 'open', projectId: other.id, name: 'Other venue' });
    expect(r.view()).toContain('Open anyway');
    expect(r.studio.ran).toEqual([]);
    r.a.confirmOpen(); await flush();
    expect(r.studio.ran).toHaveLength(1);
    expect(r.studio.doc.id).toBe(other.id);
    expect(r.studio.ran[0].label).toBe('Open “Other venue” from your account');
    r.m.unmount();
  });

  it('delete asks, then removes it from the account; the working copy on this device is untouched', async () => {
    const r = rig();
    await flush();
    await r.a.saveToAccount(); await flush();
    r.a.togglePanel(); await flush();
    const id = r.studio.doc.id;
    r.a.requestDelete(id); await flush();
    expect(r.view()).toContain('It stays on any device that has it open');
    r.a.confirmDelete(); await flush();
    expect(r.srv.store.rows.get('u1')!.size).toBe(0);
    expect(r.a.state.status).toBe('offer');
    expect(r.studio.doc.id).toBe(id);
    expect(r.studio.ran).toEqual([]);
    r.m.unmount();
  });

  function browser() {
    const listeners = new Map<string, Set<() => void>>();
    const on = (t: string, f: () => void) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); };
    const off = (t: string, f: () => void) => { listeners.get(t)?.delete(f); };
    const doc = { visibilityState: 'visible' as 'visible' | 'hidden', addEventListener: on, removeEventListener: off };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { addEventListener: on, removeEventListener: off });
    return { doc, fire: (t: string) => { for (const f of [...(listeners.get(t) ?? [])]) f(); } };
  }

  it('offline at an edit: says so, keeps the device copy, and goes up when the browser says it is back online', async () => {
    const b = browser();
    const r = rig();
    await flush();
    await r.a.saveToAccount(); await flush();
    r.srv.state.offline = true;
    r.clock.t += 60_000;
    r.studio.run({ label: 'Rename', ops: [{ op: 'setName', name: 'While offline' }] });
    r.a.togglePanel(); await flush();
    expect(r.a.state.status).toBe('offline');
    expect(r.view()).toContain('Offline: saved on this device');
    expect(r.srv.store.rows.get('u1')!.get(r.studio.doc.id)!.name).not.toBe('While offline');
    r.srv.state.offline = false;
    b.fire('online'); await flush();
    expect(r.srv.store.rows.get('u1')!.get(r.studio.doc.id)!.name).toBe('While offline');
    expect(r.a.state.status).toBe('in-account');
    r.m.unmount();
    vi.unstubAllGlobals();
  });

  it('the page hiding sends a pending change at once, inside the throttle (a keepalive request)', async () => {
    const b = browser();
    const r = rig();
    await flush();
    await r.a.saveToAccount(); await flush();
    r.clock.t += 1_000;   // well inside the 20 s throttle: the timer would wait
    r.studio.run({ label: 'Rename', ops: [{ op: 'setName', name: 'Before hiding' }] });
    r.a.togglePanel(); await flush();
    expect(r.a.state.status).toBe('pending');
    expect(r.srv.store.rows.get('u1')!.get(r.studio.doc.id)!.rev).toBe(1);
    b.doc.visibilityState = 'hidden';
    b.fire('visibilitychange'); await flush();
    expect(r.srv.store.rows.get('u1')!.get(r.studio.doc.id)!).toMatchObject({ rev: 2, name: 'Before hiding' });
    expect(r.a.state.status).toBe('in-account');
    // the throttled timer then finds nothing left to send: no second write of the same content
    r.clock.t += 60_000;
    r.a.togglePanel(); await flush();
    expect(r.srv.state.puts).toHaveLength(2);
    r.m.unmount();
    vi.unstubAllGlobals();
  });

  it('error codes read as plain words', () => {
    expect(accountErrorText('project_too_large')).toMatch(/too big .* export it/);
    expect(accountErrorText('quota_projects')).toMatch(/20 projects/);
    expect(accountErrorText('studio_save_unavailable')).not.toMatch(/\b(age|13|18|teen|adult)\b/i);
  });
});
