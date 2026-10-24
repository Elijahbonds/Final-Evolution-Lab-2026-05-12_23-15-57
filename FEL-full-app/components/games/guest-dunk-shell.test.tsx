// TIP-GUEST-TOKEN-HASH Part A (PRIVACY-CORE 1b, 2026-10-19): /try asks the year BEFORE any guest row. vitest runs in node
// (no jsdom), so this calls the real shell inside a host render (tests/helpers/driveRender.ts): its mount effects are
// recorded and run inside a render pass, as a mount would run them, and the AgeStep it renders is answered through the
// props the real AgeStep calls. fetch, navigator.sendBeacon and track/flush are spies; the Babylon stage is a stub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drive, findAll, settle, type Found } from '@/tests/helpers/driveRender';

const fx = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, track: [] as unknown[][], flush: 0 }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useEffect = ((effect: () => unknown) => { fx.effects.push(effect); }) as typeof actual.useEffect;
  const base = ((actual as unknown as { default?: typeof actual }).default ?? actual) as typeof actual;
  return { ...actual, useEffect, default: { ...base, useEffect } };
});
vi.mock('next/dynamic', () => ({ default: () => function Stage() { return null; } }));
vi.mock('@/lib/analytics', () => ({
  track: (...a: unknown[]) => { fx.track.push(a); },
  flush: async () => { fx.flush++; },
}));

import { GuestDunkShell } from './guest-dunk-shell';
import { AgeStep } from '@/components/age-step';
import { AGE_QUESTION } from '@/lib/privacy/ageScreen';

const THIS_YEAR = new Date().getFullYear();
let fetchCalls: Array<[string, RequestInit | undefined]> = [];
let beacons: unknown[] = [];
let cookieWrites: string[] = [];
let store: Map<string, string>;

function stubBrowser(cookie = '') {
  fetchCalls = []; beacons = []; cookieWrites = []; store = new Map();
  fx.track = []; fx.flush = 0;
  let jar = cookie;
  vi.stubGlobal('document', {
    get cookie() { return jar; },
    set cookie(v: string) { cookieWrites.push(v); jar = jar ? `${jar}; ${v.split(';')[0]}` : v.split(';')[0]; },
  });
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { fetchCalls.push([String(url), init]); return new Response('{}'); }));
  vi.stubGlobal('navigator', { sendBeacon: vi.fn((u: unknown) => { beacons.push(u); return true; }) });
}

/** Render the shell and run its mount effects inside the first render pass, as a mount would run them. */
function mount() {
  return drive(() => { fx.effects.length = 0; return GuestDunkShell({ challengeCode: 'C1' }); }, [
    () => { for (const e of fx.effects.splice(0)) e(); },
  ]);
}
const ageStep = (tree: React.ReactElement): Found => {
  const [el] = findAll(tree, (e) => e.type === AgeStep);
  if (!el) throw new Error('no AgeStep in the tree');
  return el;
};
const guestPosts = () => fetchCalls.filter(([u, i]) => u === '/api/guest' && i?.method === 'POST');
const nothingSent = () => {
  expect(fetchCalls).toEqual([]);
  expect(beacons).toEqual([]);
  expect(fx.track).toEqual([]);
  expect(fx.flush).toBe(0);
};

beforeEach(() => { stubBrowser(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('/try asks the year before any guest row', () => {
  it('on mount: the year question is up, the game is not, and 0 fetch / beacon / track', async () => {
    const r = mount();
    await settle();
    expect(findAll(r.tree, (e) => e.type === AgeStep)).toHaveLength(1);
    expect(r.html).toContain(AGE_QUESTION);
    expect(r.html).toContain('Play without saving');
    expect(r.html).not.toContain('CLAIM');
    nothingSent();
    // the real AgeStep in the mode the shell asks for makes no request of its own either (account mode would POST)
    expect(ageStep(r.tree).props.mode).toBe('signup');
  });

  it.each([12, 13])('blocked (thisYear−%s) through the real AgeStep: fel_age_gate written, 0 fetch / beacon / track, no /api/guest', async (gap) => {
    let blocked = false;
    const step = drive(() => AgeStep({ mode: 'signup', onBlocked: () => { blocked = true; }, onLocked: () => { throw new Error('a blocked year must not lock'); } }), [
      (tree) => { findAll(tree, (e) => e.type === 'select')[0].props.onChange({ target: { value: String(THIS_YEAR - gap) } }); },
    ]);
    findAll(step.tree, (e) => e.type === 'button')[0].props.onClick();
    await settle();
    expect(blocked).toBe(true);
    // and the shell's own handler for it
    const r = drive(() => GuestDunkShell({ challengeCode: 'C1' }), [(tree) => ageStep(tree).props.onBlocked()]);
    await settle();
    expect(cookieWrites.length).toBeGreaterThan(0);
    for (const c of cookieWrites) expect(c).toMatch(/^fel_age_gate=1; Max-Age=31536000; Path=\/; SameSite=Lax/);
    expect(store.get('fel:ageGate')).toBe('1');
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(r.html).not.toContain('CLAIM');
    expect(r.html).not.toContain('SAVE THIS RUN');
    nothingSent();
    expect(guestPosts()).toEqual([]);
  });

  it.each([['teen (thisYear−15)', THIS_YEAR - 15], ['teen (thisYear−17)', THIS_YEAR - 17]])('%s: 0 /api/guest, 0 track, the run plays locally', async (_l, year) => {
    const r = drive(() => GuestDunkShell({ challengeCode: 'C1' }), [(tree) => ageStep(tree).props.onLocked(year)]);
    await settle();
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(r.html).not.toContain('CLAIM');
    nothingSent();
  });

  it('dismissed ("Play without saving"): 0 /api/guest, 0 track, the run plays locally', async () => {
    const r = drive(() => GuestDunkShell({ challengeCode: 'C1' }), [
      (tree) => { findAll(tree, (e) => e.type === 'button' && e.props.children === 'Play without saving')[0].props.onClick(); },
    ]);
    await settle();
    expect(r.html).not.toContain(AGE_QUESTION);
    nothingSent();
  });

  it('adult (thisYear−30): exactly 1 POST /api/guest, then play_now_click', async () => {
    const r = drive(() => GuestDunkShell({ challengeCode: 'C1' }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 30)]);
    expect(fx.track).toEqual([]);   // play_now_click waits for the guest start
    await settle();
    expect(guestPosts()).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
    expect(fx.track).toEqual([['play_now_click', { target: 'dunk' }]]);
    expect(beacons).toEqual([]);
    expect(r.html).not.toContain(AGE_QUESTION);
    // nothing about the year rides on the request
    expect(JSON.stringify(fetchCalls)).not.toContain(String(THIS_YEAR - 30));
  });

  it('with the block flag already present: the mount goes straight to the blocked state, 0 requests', async () => {
    stubBrowser('fel_age_gate=1');
    const r = mount();
    await settle();
    expect(findAll(r.tree, (e) => e.type === AgeStep)).toEqual([]);
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(r.html).not.toContain('CLAIM');
    nothingSent();
    expect(cookieWrites).toEqual([]);   // read only
  });

  it('control: the same mount with no flag stays on the question, so the flag is what skipped it', async () => {
    const r = mount();
    await settle();
    expect(findAll(r.tree, (e) => e.type === AgeStep)).toHaveLength(1);
    expect(r.html).toContain(AGE_QUESTION);
    nothingSent();
  });

  it('a finished night: no challenge attempt POST and no track for a local run; both for an adult', async () => {
    const stage = (tree: React.ReactElement) => findAll(tree, (e) => typeof e.props.onEnd === 'function')[0];
    vi.spyOn(console, 'error').mockImplementation(() => {});   // a handler called after the render updates nothing mounted
    const local = drive(() => GuestDunkShell({ challengeCode: 'C1' }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 15)]);
    const l = stage(local.tree);
    expect(l, 'the stage renders after the answer').toBeTruthy();
    await l.props.onEnd({ score: 70, won: true });
    if (l.props.onCard) await l.props.onCard({ score: 70, won: true });
    await settle();
    nothingSent();

    const adult = drive(() => GuestDunkShell({ challengeCode: 'C1' }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 30)]);
    await settle();
    await stage(adult.tree).props.onEnd({ score: 70, won: true });
    await settle();
    expect(fetchCalls.map(([u]) => u)).toEqual(['/api/guest', '/api/challenge/C1/attempt']);
    expect(fx.track.map(([n]) => n)).toEqual(['play_now_click', 'first_dunk_judged']);
    vi.mocked(console.error).mockRestore();
  });

  it('the year never reaches the server and is never stored', async () => {
    drive(() => GuestDunkShell({ challengeCode: 'C1' }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 40)]);
    await settle();
    drive(() => GuestDunkShell({ challengeCode: 'C1' }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 15)]);
    await settle();
    const year = /\b(19|20)\d\d\b/;
    expect(JSON.stringify(fetchCalls)).not.toMatch(year);
    expect(JSON.stringify(fx.track)).not.toMatch(year);
    expect([...store.values(), ...cookieWrites].join('|')).not.toMatch(year);
  });
});
