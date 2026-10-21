// Nexus Studio's "Edit in the Closet", the Closet's half (docs/NEXUS-STUDIO.md §12.2, §12.5): /closet?studioEdit=<session>
// opens ONE character from the Studio's hand-off on this device; nothing reaches the account (no closet fetch, save or buy)
// or the device's own look (no writeLocalLook, no consent write); "Back to Nexus Studio" writes the return the Studio's
// reader (castCloset.takeClosetReturn) accepts. Without the param, or with a session readClosetEdit rejects (stale, foreign,
// malformed), /closet is the live page it was. ClosetView runs whole on the test hook runtime (no DOM): its hooks and
// effects are real, the children are elements (not rendered), and fetch and localStorage are stubs the test reads.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';
import { mount, type Mounted } from '@/tests/helpers/hookRuntime';
import { button, buttons, findAll, textOf, type Found } from '@/tests/helpers/driveRender';
import { memoryKV, type MemoryKV } from '@/tests/helpers/nexusStudio';
import { CAST_SLOT, castCode } from '@/tests/helpers/studioCast';
import { ClosetView } from '@/components/closet-view';
import { SlotBar } from '@/components/closet/slot-bar';
import { LookConsent } from '@/components/creator/look-consent';
import { PublishLookAsCard } from '@/components/pipelines/publish-look';
import { CLOSET_EDIT_KEY, CLOSET_EDIT_TTL_MS, CLOSET_RETURN_KEY, startClosetEdit, takeClosetReturn } from '@/lib/nexus-studio/castCloset';
import { LOCAL_CONSENT_KEY, LOCAL_LOOK_KEY } from '@/lib/creator/localLook';
import { WALK_KEY } from '@/lib/creator/look/studio/walkthrough';
import { faceMorphList } from '@/lib/creator/look/faceMorphList';
import { BodyControls } from '@/components/closet/character-controls';
import { WalkthroughCard } from '@/components/closet/studio/walkthrough-card';
import { decodeSlotCode, encodeSlotCode } from '@/lib/creator/look/shareCode';

const SESSION = 'ce_session0001';
/** The Fine-tune slider for the faceLong morph (its aria-label is the slider's label). */
const sliderLabel = faceMorphList(['faceLong'])[0].label;
const flush = () => new Promise((r) => setTimeout(r, 0));
const until = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await flush(); expect(ok()).toBe(true); };

type Call = { url: string; method: string };
function rig(search: string, kv: MemoryKV = memoryKV(), o: { walkSeen?: boolean } = {}) {
  if (o.walkSeen !== false) kv.data.set(WALK_KEY, 'done');   // the first-visit walkthrough would move the tab; it is not what these tests are about (studio-5's are)
  const writes: string[] = [];
  const setItem = kv.setItem.bind(kv);
  kv.setItem = (k, v) => { writes.push(k); setItem(k, v); };
  const close = vi.fn();
  vi.stubGlobal('window', { location: { search }, localStorage: kv, close, addEventListener: () => {}, removeEventListener: () => {} });
  const calls: Call[] = [];
  const res = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    if (url === '/api/v1/closet') return res(init?.method === 'POST' ? { ok: true } : { look: { face: { faceShape: 'Square' } }, owned: [], skins: [] });
    if (url === '/api/v1/hero-body') return res({ body: 'kit-male', scanOwned: false });
    return res({ ok: true });
  }));
  return { kv, writes, close, calls };
}
const open = async (props: { faceScan?: boolean } = {}): Promise<Mounted> => {
  const m = mount(() => ClosetView(props));
  await until(() => /Save Look|Back to Nexus Studio/.test(textOf(m.tree as never)));
  return m;
};
const tree = (m: Mounted) => m.tree as never;
const of = (m: Mounted, type: unknown) => findAll(tree(m), (el) => el.type === type);
const chip = (m: Mounted, label: string): Found => {
  const hits = findAll(tree(m), (el) => el.props.label === label && typeof el.props.onClick === 'function');
  expect(hits, label).toHaveLength(1);
  return hits[0];
};
/** The Wearables tab's buy buttons (their text is the coin price). */
const buyButtons = async (m: Mounted) => {
  chip(m, 'Wearables').props.onClick();
  await flush();
  const b = buttons(tree(m), /^\s*\d+\s*$/);
  expect(b.length).toBeGreaterThan(0);
  return b;
};
const handOff = async (kv: MemoryKV, at = Date.now(), name = 'Nova', lookCode?: string) =>
  startClosetEdit(kv, { id: 'char_1', name, lookCode: lookCode ?? await castCode() }, at, SESSION);
/** The Fine-tune (sculpt) slider for a face morph: an edit that writes the slot's face numbers. */
const sculpt = async (m: Mounted, label: string, value: number) => {
  const hits = findAll(tree(m), (el) => el.type === 'input' && el.props.type === 'range' && el.props['aria-label'] === label);
  expect(hits, label).toHaveLength(1);
  hits[0].props.onChange({ target: { value: String(value) } });
  await flush();
};
/** Send the look back and decode what the Studio would take. */
const sendBack = async (m: Mounted, kv: MemoryKV) => {
  button(tree(m), /Back to Nexus Studio/).props.onClick();
  await until(() => kv.data.has(CLOSET_RETURN_KEY));
  const d = await decodeSlotCode(takeClosetReturn(kv, SESSION)!.code);
  if (!d.ok) throw new Error('the return does not decode');
  return d;
};

afterEach(() => { vi.unstubAllGlobals(); vi.mocked(toast.success).mockClear(); vi.mocked(toast.error).mockClear(); });

describe('no ?studioEdit= — the live Closet, as before', () => {
  it('fetches the account closet, shows Save Look, the consent, the slot bar and publish; save, buy and the device look work', async () => {
    const r = rig('');
    const m = await open();
    expect(r.calls).toEqual([{ url: '/api/v1/closet', method: 'GET' }, { url: '/api/v1/hero-body', method: 'GET' }]);
    expect(textOf(tree(m))).toContain('Save Look');
    expect(textOf(tree(m))).not.toContain('Nexus Studio');
    for (const t of [SlotBar, LookConsent, PublishLookAsCard]) expect(of(m, t)).toHaveLength(1);
    expect(findAll(tree(m), (el) => el.props.title === 'Paste a share code as a new character')).toHaveLength(1);
    expect(r.writes).not.toContain('__fel_ns_probe');   // a plain /closet does not touch the Studio's storage
    // the device keeps the look (the hydrated look is written once loading ends) …
    expect(r.writes).toContain(LOCAL_LOOK_KEY);
    // … Save Look posts to the account and writes the consent and the device look …
    r.writes.length = 0;
    button(tree(m), /Save Look/).props.onClick();
    await until(() => r.calls.some((c) => c.method === 'POST' && c.url === '/api/v1/closet') && r.writes.includes(LOCAL_CONSENT_KEY));
    expect(r.writes).toContain(LOCAL_LOOK_KEY);
    // … and a buy goes to the shop
    (await buyButtons(m))[0].props.onClick();
    await until(() => r.calls.some((c) => c.url === '/api/v1/closet/buy'));
    m.unmount();
  });
});

describe('?studioEdit=<session> with the Studio\'s hand-off on this device', () => {
  it('opens ONE character from the session, named from it; reads nothing from the account; says nothing is saved', async () => {
    const r = rig(`?studioEdit=${SESSION}`);
    await handOff(r.kv);
    const m = await open();
    const text = textOf(tree(m));
    expect(r.calls).toEqual([]);   // no /api/v1/closet, no hero-body: nothing is asked of the account
    expect(text).toContain('Back to Nexus Studio');
    expect(text).not.toContain('Save Look');
    expect(text).toContain('Editing Nova for Nexus Studio. Nothing here is saved to your Closet; Back to Nexus Studio hands the look back.');
    expect(text).toContain('NOVA');   // the character's label (the Closet's jersey-plate form of the name)
    // no other characters, no consent, no publish
    for (const t of [SlotBar, LookConsent, PublishLookAsCard]) expect(of(m, t)).toHaveLength(0);
    expect(findAll(tree(m), (el) => el.props.title === 'Paste a share code as a new character')).toHaveLength(0);   // its paste lives in the slot bar
    // the preview wears the code's own body (CAST_SLOT is female; the account's would be kit-male)
    expect(findAll(tree(m), (el) => 'studio' in el.props && 'body' in el.props)[0].props.body).toBe('kit-female');
    m.unmount();
  });

  it('save, buy and the device look do nothing: no fetch, no consent write, no writeLocalLook, even after edits', async () => {
    const r = rig(`?studioEdit=${SESSION}`);
    await handOff(r.kv);
    r.writes.length = 0;   // (the Studio's own hand-off write above)
    const m = await open();
    chip(m, 'Heart').props.onClick();   // an edit: the device-look effect re-runs
    await flush();
    for (const b of await buyButtons(m)) b.props.onClick();
    await flush(); await flush();
    expect(r.calls).toEqual([]);
    expect(r.writes.filter((k) => k !== '__fel_ns_probe')).toEqual([]);
    expect(r.kv.data.has(LOCAL_LOOK_KEY)).toBe(false);
    expect(r.kv.data.has(LOCAL_CONSENT_KEY)).toBe(false);
    m.unmount();
  });

  it('save is gated in the function too, not only by hiding its buttons (Save Look and the slot bar\'s Play as)', () => {
    // No control in this tab reaches save (both buttons are gone, asserted above), so the guard is held in source.
    const src = readFileSync('components/closet-view.tsx', 'utf8');
    expect(src).toMatch(/const save = async \(playAs\?: string\) => \{\n\s+if \(studioEdit\) return;/);
    expect(src).toMatch(/const buy = async \(itemId: string\) => \{\n\s+const w = getWearable\(itemId\);\n\s+if \(!w \|\| studioEdit\) return;/);
  });

  it('"Back to Nexus Studio" writes the return the Studio\'s reader takes: this session, this character, the edited look', async () => {
    const r = rig(`?studioEdit=${SESSION}`);
    await handOff(r.kv);
    const m = await open();
    chip(m, 'Heart').props.onClick();
    await flush();
    button(tree(m), /Back to Nexus Studio/).props.onClick();
    await until(() => r.kv.data.has(CLOSET_RETURN_KEY));
    await until(() => r.close.mock.calls.length === 1);
    expect(toast.success).toHaveBeenCalledWith('Sent back to Nexus Studio.');
    const back = takeClosetReturn(r.kv, SESSION)!;
    expect(back).toMatchObject({ session: SESSION, characterId: 'char_1' });
    expect(back.name).toBeUndefined();   // the Studio keeps its own name ("Nova", not the label "NOVA")
    const d = await decodeSlotCode(back.code);
    expect(d.ok && d.base.faceShape).toBe('Heart');
    expect(d.ok && d.slot?.body).toBe('female');
    expect(d.ok && d.doc.parts.map((p) => p.shape)).toEqual(CAST_SLOT.doc.parts.map((p) => p.shape));
    expect(r.kv.data.has(LOCAL_LOOK_KEY)).toBe(false);
    m.unmount();
  });

  it('when the Studio has stopped waiting, nothing is written and the tab stays open with the way back by hand', async () => {
    const r = rig(`?studioEdit=${SESSION}`);
    await handOff(r.kv);
    const m = await open();
    r.kv.data.delete(CLOSET_EDIT_KEY);   // the Studio cancelled
    button(tree(m), /Back to Nexus Studio/).props.onClick();
    await until(() => vi.mocked(toast.error).mock.calls.length === 1);
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toMatch(/no longer waiting.*Nexus Studio/);
    expect(r.kv.data.has(CLOSET_RETURN_KEY)).toBe(false);
    expect(r.close).not.toHaveBeenCalled();
    m.unmount();
  });
});

describe('face numbers and the face scan in edit mode (no consent step there)', () => {
  it('a code that came in WITHOUT face numbers goes back without them, even after a sculpt edit', async () => {
    const r = rig(`?studioEdit=${SESSION}`);
    await handOff(r.kv);   // castCode(): CAST_SLOT has no sliders, and a share code leaves them out by default
    expect((await decodeSlotCode(JSON.parse(r.kv.getItem(CLOSET_EDIT_KEY)!).code) as { slot?: { sliders?: unknown } }).slot?.sliders).toBeUndefined();
    const m = await open();
    await sculpt(m, sliderLabel, 60);
    const d = await sendBack(m, r.kv);
    expect(d.slot?.sliders).toBeUndefined();
    expect(d.slot?.body).toBe('female');   // the rest of the look still travels
    m.unmount();
  });
  it('a code that came in WITH face numbers keeps them, and a sculpt edit to them goes back', async () => {
    const r = rig(`?studioEdit=${SESSION}`);
    await handOff(r.kv, Date.now(), 'Nova', await encodeSlotCode({ ...CAST_SLOT, sliders: { faceRound: 0.25 } }, { numbers: true }));
    const m = await open();
    await sculpt(m, sliderLabel, 60);
    const d = await sendBack(m, r.kv);
    expect(d.slot?.sliders).toEqual({ faceLong: 0.6, faceRound: 0.25 });
    m.unmount();
  });
  it('no face-scan entry while editing a Studio character, even with the flag on; the live Closet keeps it', async () => {
    const r = rig(`?studioEdit=${SESSION}`);
    await handOff(r.kv);
    const m = await open({ faceScan: true });
    expect(textOf(tree(m))).not.toContain('Scan My Face');
    m.unmount();
    rig('');
    const n = await open({ faceScan: true });
    expect(textOf(tree(n))).toContain('Scan My Face');
    n.unmount();
  });
});

describe('a session the Closet rejects: the normal Closet', () => {
  const normal = async (r: ReturnType<typeof rig>) => {
    const m = await open();
    expect(r.calls.some((c) => c.url === '/api/v1/closet' && c.method === 'GET')).toBe(true);
    expect(textOf(tree(m))).toContain('Save Look');
    expect(textOf(tree(m))).not.toContain('Nexus Studio');
    expect(of(m, SlotBar)).toHaveLength(1);
    expect(r.kv.data.has(LOCAL_LOOK_KEY)).toBe(true);
    m.unmount();
  };
  it('stale (older than the hand-off TTL)', async () => {
    const r = rig(`?studioEdit=${SESSION}`);
    await handOff(r.kv, Date.now() - CLOSET_EDIT_TTL_MS - 60_000);
    await normal(r);
  });
  it('foreign (another tab\'s session)', async () => {
    const r = rig('?studioEdit=ce_someoneelse01');
    await handOff(r.kv);
    await normal(r);
  });
  it('malformed (not JSON, not a code, a bad session id)', async () => {
    const r = rig(`?studioEdit=${SESSION}`);
    r.kv.data.set(CLOSET_EDIT_KEY, JSON.stringify({ v: 1, session: SESSION, characterId: 'char_1', name: 'x', code: 'hello', at: Date.now() }));
    await normal(r);
    const r2 = rig('?studioEdit=../../x');
    await handOff(r2.kv);
    await normal(r2);
  });
});

// studio-5 (docs/NEXUS-STUDIO.md §13.4): the two follow-ups §12.2 left for the creator lane. In Studio-edit mode the Body note (and
// the Shape tab's, which had the same words) stop pointing at the hidden look-numbers consent, and the walkthrough's last step is
// the hand-back. A normal /closet passes the very same props as before (no `studioEdit` key at all) and still completes the
// walkthrough with Save Look.
describe('studio-5: the Body and Shape notes, and the walkthrough, in edit mode only', () => {
  const walkCards = (m: Mounted) => of(m, WalkthroughCard);
  const toShape = async (m: Mounted) => { chip(m, 'Shape').props.onClick(); await flush(); };
  /** The Shape tab (a dynamic import in the Closet, so found by its props). */
  const shapeTab = (m: Mounted) => { const t = findAll(tree(m), (el) => 'onShape' in el.props && 'numbersSaved' in el.props); expect(t).toHaveLength(1); return t[0]; };

  it('a normal /closet: the controls and the walkthrough get exactly the props they always had; Save Look still completes it', async () => {
    const r = rig('', memoryKV(), { walkSeen: false });
    const m = await open();
    await until(() => walkCards(m).length === 2);   // the stage's card and the phone's
    for (const c of walkCards(m)) expect(Object.keys(c.props).sort()).toEqual(['onNext', 'onSkip', 'state']);
    await toShape(m);
    expect(Object.keys(shapeTab(m).props)).not.toContain('studioEdit');
    chip(m, 'Face').props.onClick(); await flush();
    expect(Object.keys(of(m, BodyControls)[0].props).sort()).toEqual(['body', 'frame', 'numbersSaved', 'onBody', 'onFrame', 'scanOwned']);
    // part → paint → save, the save step completed by Save Look, as it always was
    walkCards(m)[0].props.onNext(); await flush();
    walkCards(m)[0].props.onNext(); await flush();
    expect(walkCards(m)[0].props.state.step).toBe(2);
    button(tree(m), /Save Look/).props.onClick();
    await until(() => r.kv.data.get(WALK_KEY) === 'done');
    expect(walkCards(m)[0].props.state.over).toBe(true);
    m.unmount();
  });

  it('edit mode: the Body and Shape controls are told, the walkthrough\'s last step is the hand-back, and Back to Nexus Studio completes it', async () => {
    const r = rig(`?studioEdit=${SESSION}`, memoryKV(), { walkSeen: false });
    await handOff(r.kv);
    const m = await open();
    await until(() => walkCards(m).length === 2);
    for (const c of walkCards(m)) expect(c.props.studioEdit).toBe(true);
    chip(m, 'Face').props.onClick(); await flush();
    expect(of(m, BodyControls)[0].props.studioEdit).toBe(true);
    await toShape(m);
    expect(shapeTab(m).props.studioEdit).toBe(true);
    walkCards(m)[0].props.onNext(); await flush();
    walkCards(m)[0].props.onNext(); await flush();
    expect(walkCards(m)[0].props.state.step).toBe(2);   // the save step, which this mode's Back to Nexus Studio completes
    button(tree(m), /Back to Nexus Studio/).props.onClick();
    await until(() => r.close.mock.calls.length === 1);
    expect(r.kv.data.get(WALK_KEY)).toBe('done');
    m.unmount();
  });

  it('edit mode, the Studio no longer waiting: the hand-back failed, so the step is not completed', async () => {
    const r = rig(`?studioEdit=${SESSION}`, memoryKV(), { walkSeen: false });
    await handOff(r.kv);
    const m = await open();
    await until(() => walkCards(m).length === 2);
    walkCards(m)[0].props.onNext(); await flush();
    walkCards(m)[0].props.onNext(); await flush();
    r.kv.data.delete(CLOSET_EDIT_KEY);
    button(tree(m), /Back to Nexus Studio/).props.onClick();
    await until(() => vi.mocked(toast.error).mock.calls.length === 1);
    expect(walkCards(m)[0].props.state).toMatchObject({ step: 2, over: false });
    expect(r.kv.data.has(WALK_KEY)).toBe(false);
    m.unmount();
  });
});
