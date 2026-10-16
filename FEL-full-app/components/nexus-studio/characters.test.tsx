// Track 3 (studio-4b) in the Characters panel: the crowd's seats and "Edit in the Closet" — the hand-off out, the edited look back
// as ONE command (decoded first), the manual path, and the panel's controls. Hooks run on the test hook runtime (no DOM).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mount } from '@/tests/helpers/hookRuntime';
import { CharactersTrack, CastSlotField, crowdSummary, useClosetEdit } from './characters';
import { starterProject, type StudioApi } from './use-studio';
import { CLOSET_EDIT_KEY, CLOSET_RETURN_KEY, writeClosetReturn } from '@/lib/nexus-studio/castCloset';
import { addCharacter, toggleCrowdCast } from '@/lib/nexus-studio/edits';
import { createStack, execute, type Command } from '@/lib/nexus-studio/commands';
import { memoryKV } from '@/tests/helpers/nexusStudio';
import { CAST_SLOT, castCode } from '@/tests/helpers/studioCast';

afterEach(() => { vi.unstubAllGlobals(); });

async function project(n = 2) {
  const code = await castCode();
  let s = createStack(starterProject());
  for (let i = 0; i < n; i++) s = execute(s, addCharacter(s.doc, { name: `Fan ${i}`, lookCode: code }).cmd);
  return s;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the crowd in the panel', () => {
  it('the inspector says who sits in the crowd; the track offers "Seat in the crowd" and "Edit in the Closet" per character', async () => {
    let s = await project(2);
    const v = () => s.doc.venues[0];
    expect(crowdSummary(s.doc, v())).toBe('Only the crowd’s own fans');
    s = execute(s, toggleCrowdCast(v(), s.doc.characters[1].id)!);
    expect(crowdSummary(s.doc, v())).toBe('Fan 1');
    const field = renderToStaticMarkup(createElement(CastSlotField, { project: s.doc, venue: v(), run: () => {} }));
    expect(field).toContain('In the crowd');
    expect(field).toContain('data-testid="crowd-cast-summary"');
    expect(field.match(/aria-pressed="true"/g)).toHaveLength(1);
    const track = renderToStaticMarkup(createElement(CharactersTrack, { studio: { doc: s.doc, venue: v(), run: () => {}, seal: () => {} } as unknown as StudioApi }));
    expect(track.match(/Edit in the Closet/g)).toHaveLength(2);
    expect(track).toContain('In the crowd');
    expect(track).toContain('Seat in the crowd');
  });
});

describe('Edit in the Closet', () => {
  function rig() {
    const kv = memoryKV();
    const listeners = new Map<string, Set<(e: unknown) => void>>();
    const open = vi.fn();
    vi.stubGlobal('window', {
      localStorage: kv, open,
      addEventListener: (t: string, f: (e: unknown) => void) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); },
      removeEventListener: (t: string, f: (e: unknown) => void) => { listeners.get(t)?.delete(f); },
    });
    const fire = (t: string, e: unknown = {}) => { for (const f of [...(listeners.get(t) ?? [])]) f(e); };
    return { kv, open, fire, listeners };
  }
  it('hands the code to the Closet tab, and the Closet\'s return lands as ONE command; the keys are cleared, the listeners go', async () => {
    const r = rig();
    const s = await project(1);
    const c = s.doc.characters[0];
    const ran: Command[] = [];
    let api!: ReturnType<typeof useClosetEdit>;
    const m = mount(() => { api = useClosetEdit({ doc: s.doc, run: (cmd: Command) => { ran.push(cmd); } } as unknown as StudioApi); return null; });
    api.start(c);
    await flush();
    expect(r.open).toHaveBeenCalledTimes(1);
    const url = r.open.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/closet\?studioEdit=ce_[a-z0-9]{16}$/);
    expect(JSON.parse(r.kv.getItem(CLOSET_EDIT_KEY)!).code).toBe(c.lookCode);
    expect(api.editing?.characterId).toBe(c.id);
    // the Closet tab (another tab: its own code path) sends the edited look back
    const edited = await castCode({ ...CAST_SLOT, base: { ...CAST_SLOT.base, hairColor: '#FF0000' } });
    expect(writeClosetReturn(r.kv, url.split('=')[1], edited, 'Fan red')).toBe(true);
    r.fire('storage', { key: 'something.else' });
    await flush();
    expect(ran).toHaveLength(0);
    r.fire('storage', { key: CLOSET_RETURN_KEY });
    for (let i = 0; i < 20 && !ran.length; i++) await flush();
    expect(ran).toHaveLength(1);
    expect(ran[0]).toMatchObject({ label: 'Edit look in the Closet', ops: [{ op: 'patchCharacter', id: c.id, patch: { lookCode: edited, name: 'Fan red' } }] });
    expect(r.kv.data.size).toBe(0);
    await flush();
    expect(api.editing).toBeNull();
    expect(api.note).toMatch(/Undo puts the old one back/);
    expect(r.listeners.get('storage')?.size ?? 0).toBe(0);   // nothing left listening once the look came back
    m.unmount();
  });
  it('a name that only changed case (the Closet shows labels in capitals) is not a rename', async () => {
    const r = rig();
    const s = await project(1);
    const c = s.doc.characters[0];
    const ran: Command[] = [];
    let api!: ReturnType<typeof useClosetEdit>;
    const m = mount(() => { api = useClosetEdit({ doc: s.doc, run: (cmd: Command) => { ran.push(cmd); } } as unknown as StudioApi); return null; });
    api.start(c);
    const session = (r.open.mock.calls[0][0] as string).split('=')[1];
    writeClosetReturn(r.kv, session, c.lookCode!, c.name.toUpperCase());
    r.fire('storage', { key: CLOSET_RETURN_KEY });
    for (let i = 0; i < 20 && !ran.length; i++) await flush();
    expect(ran[0].ops[0]).toMatchObject({ op: 'patchCharacter', patch: { lookCode: c.lookCode } });
    expect((ran[0].ops[0] as { patch: Record<string, unknown> }).patch).not.toHaveProperty('name');
    m.unmount();
  });
  it('the manual path: a pasted code that does not decode changes nothing and says why; a good one is one command', async () => {
    rig();
    const s = await project(1);
    const c = s.doc.characters[0];
    const ran: Command[] = [];
    let api!: ReturnType<typeof useClosetEdit>;
    const m = mount(() => { api = useClosetEdit({ doc: s.doc, run: (cmd: Command) => { ran.push(cmd); } } as unknown as StudioApi); return null; });
    api.start(c);
    expect(await api.apply(c.id, 'FEL2.not-a-real-code.0000000')).toMatch(/damaged|not a Closet|cannot read|does not hold/);
    expect(ran).toHaveLength(0);
    expect(await api.apply(c.id, await castCode())).toBeNull();
    expect(ran).toHaveLength(1);
    m.unmount();
  });
  it('no device storage: nothing is opened, the manual path is still offered', async () => {
    vi.stubGlobal('window', { open: vi.fn(), addEventListener() {}, removeEventListener() {} });
    const s = await project(1);
    let api!: ReturnType<typeof useClosetEdit>;
    const m = mount(() => { api = useClosetEdit({ doc: s.doc, run: () => {} } as unknown as StudioApi); return null; });
    api.start(s.doc.characters[0]);
    await flush();
    expect((window as unknown as { open: ReturnType<typeof vi.fn> }).open).not.toHaveBeenCalled();
    expect(api.editing?.session).toBe('manual');
    m.unmount();
  });
});
